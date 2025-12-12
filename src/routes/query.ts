import express from 'express';
import { generateEmbedding } from '../services/embedder';
import { queryVectors } from '../services/vector';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCachedAnswer, cacheAnswer } from "../services/cache";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

const router = express.Router();

router.post("/", async (req: express.Request, res: express.Response) => {

    const query = req.body?.query;
    if (!query) {
        return res.status(400).json({ error: "query is essential in this case" });
    }

    try {
        // 1) CHECK CACHE
        const cached = await getCachedAnswer(query);
        if (cached) {
            return res.json({
                answer: cached.answer,
                sources: cached.sources,
                cached: true
            });
        }

        // 2) GENERATE EMBEDDING
        const qEmb = await generateEmbedding(query);

        // 3) VECTOR SEARCH
        const matches = await queryVectors(process.env.PINECONE_INDEX!, qEmb, 5);

        const context = matches
            .map(m => m.metadata?.text ?? "")
            .join("\n\n---\n\n");

        // 4) GEMINI GENERATION
        const prompt = `System: You are a helpful too intelligent assistant. Answer only using the provided context. If the answer is not present then tell us that i do not know.
    
Context:
${context}

Question: ${query}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const answer = response.text() ?? "no response";

        // 5) SAVE TO CACHE (IMPORTANT)
        await cacheAnswer(query, {
            answer,
            sources: matches.map(m => ({
                id: m.id,
                score: m.score
            }))
        });

        // 6) RETURN NORMAL RESPONSE
        return res.json({
            answer,
            sources: matches.map(m => ({
                id: m.id,
                score: m.score
            })),
            cached: false
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "internal error or service not found" });
    }
});

export default router;
