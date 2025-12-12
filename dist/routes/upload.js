"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
// @ts-ignore
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const chunker_1 = require("../services/chunker");
const embedder_1 = require("../services/embedder");
const vector_1 = require("../services/vector");
const router = express_1.default.Router();
const uploadDir = path_1.default.join(__dirname, "..", "..", "uploads");
if (!(0, fs_1.existsSync)(uploadDir))
    (0, fs_1.mkdirSync)(uploadDir, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_, __, cb) => cb(null, uploadDir),
    filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = (0, multer_1.default)({ storage });
router.post("/", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "file required" });
    }
    const filePath = path_1.default.join(uploadDir, req.file.filename);
    try {
        console.log("Reading PDF/File:", filePath);
        let text = "";
        if (req.file.mimetype === "application/pdf") {
            // CRITICAL FIX: Use the file path directly for pdf-parse 
            // to avoid loading the entire file into a buffer first, mitigating OOM error.
            const parsed = await (0, pdf_parse_1.default)(filePath);
            text = parsed.text;
            console.log("Parsed text length:", text.length);
        }
        else {
            // Read text files into a buffer for processing
            const buffer = await promises_1.default.readFile(filePath);
            text = buffer.toString("utf8");
        }
        if (!text.trim())
            throw new Error("No text extracted.");
        const chunkSize = Number(process.env.CHUNK_SIZE ?? 800);
        const batchSize = Number(process.env.PINECONE_BATCH_SIZE ?? 50); // New environment variable for batching
        const chunks = (0, chunker_1.chunkText)(text, chunkSize);
        console.log(`Processing ${chunks.length} chunks in batches of ${batchSize}`);
        // Batching loop to prevent JavaScript heap out of memory
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batchChunks = chunks.slice(i, i + batchSize);
            // 1. Generate embeddings for the batch
            const embeddingPromises = batchChunks.map(chunk => (0, embedder_1.generateEmbedding)(chunk));
            const batchEmbeddings = await Promise.all(embeddingPromises);
            // 2. Map embeddings to Pinecone vectors
            const batchVectors = batchEmbeddings.map((emb, j) => ({
                id: `${Date.now()}-${i + j}`, // Unique ID
                values: emb,
                metadata: { text: batchChunks[j].slice(0, 1000) },
            }));
            // 3. Upsert the batch and free memory
            await (0, vector_1.upsertVectors)(process.env.PINECONE_INDEX, batchVectors);
            console.log(`Upserted batch ${i / batchSize + 1}/${Math.ceil(chunks.length / batchSize)}`);
        }
        // Clean up the uploaded file
        await promises_1.default.unlink(filePath);
        return res.json({
            message: "Uploaded & indexed successfully",
            chunks: chunks.length,
        });
    }
    catch (err) {
        console.error(err);
        // Ensure file deletion even on error
        try {
            await promises_1.default.unlink(filePath);
        }
        catch (cleanupErr) {
            console.warn("Failed to clean up file:", cleanupErr);
        }
        return res.status(500).json({ error: "Internal server error" });
    }
});
exports.default = router;
