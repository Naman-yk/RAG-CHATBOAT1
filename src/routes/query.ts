import express from 'express';
import { generateEmbedding } from '../services/embedder';
import { queryVectors } from '../services/vector';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

const router = express.Router();

router.post("/", async (req: express.Request, res: express.Response) => {
    // Implement your logic here
    const query = req.body?.query;
    if (!query) {
        return res.status(400).json({ error: "query is essential in this case" });
    }
    try {
        // here we have embedded the user query
        const qEmb = await generateEmbedding(query);

        // now after embeddings we have to search the topK

        const matches = await queryVectors(process.env.PINECONE_INDEX!, qEmb, 5);

        // 3) matches this with concatentation
        const context = matches
            .map(m => m.metadata?.text ?? "")
            .join("\n\n---\n\n");

        //4) call gemini with explicit system prompt
        const prompt = `System: You are a helpful too intelligent assistant. Answer only using the provided context. If the answer is not present then tell us that i do not know.
        
        Context:
        ${context}
        
        Question: ${query}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const answer = response.text() ?? "no response";

        return res.json({
            answer, sources: matches.map(m => ({
                id: m.id,
                score: m.score
            }))
        })



    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "internal error or service not found" })
    }


});

export default router;
