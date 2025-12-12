"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const embedder_1 = require("../services/embedder");
const vector_1 = require("../services/vector");
const generative_ai_1 = require("@google/generative-ai");
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
const router = express_1.default.Router();
router.post("/", async (req, res) => {
    // Implement your logic here
    const query = req.body?.query;
    if (!query) {
        return res.status(400).json({ error: "query is essential in this case" });
    }
    try {
        // here we have embedded the user query
        const qEmb = await (0, embedder_1.generateEmbedding)(query);
        // now after embeddings we have to search the topK
        const matches = await (0, vector_1.queryVectors)(process.env.PINECONE_INDEX, qEmb, 5);
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
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "internal error or service not found" });
    }
});
exports.default = router;
