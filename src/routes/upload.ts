import express from "express";
import multer from "multer";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
// @ts-ignore
import pdf from "pdf-parse";
import { chunkText } from "../services/chunker";
import { generateEmbedding } from "../services/embedder";
import { upsertVectors } from "../services/vector";

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "..", "uploads");
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage });

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "file required" });
  }

  const filePath = path.join(uploadDir, req.file.filename);

  try {
    console.log("Reading PDF/File:", filePath);
    let text = "";

    if (req.file.mimetype === "application/pdf") {
      // CRITICAL FIX: Use the file path directly for pdf-parse 
      // to avoid loading the entire file into a buffer first, mitigating OOM error.
      const parsed = await pdf(filePath);
      text = parsed.text;
      console.log("Parsed text length:", text.length);
    } else {
      // Read text files into a buffer for processing
      const buffer = await fs.readFile(filePath);
      text = buffer.toString("utf8");
    }

    if (!text.trim()) throw new Error("No text extracted.");

    const chunkSize = Number(process.env.CHUNK_SIZE ?? 800);
    const batchSize = Number(process.env.PINECONE_BATCH_SIZE ?? 50); // New environment variable for batching
    const chunks = chunkText(text, chunkSize);

    console.log(`Processing ${chunks.length} chunks in batches of ${batchSize}`);

    // Batching loop to prevent JavaScript heap out of memory
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, i + batchSize);

      // 1. Generate embeddings for the batch
      const embeddingPromises = batchChunks.map(chunk => generateEmbedding(chunk));
      const batchEmbeddings = await Promise.all(embeddingPromises);

      // 2. Map embeddings to Pinecone vectors
      const batchVectors = batchEmbeddings.map((emb, j) => ({
        id: `${Date.now()}-${i + j}`, // Unique ID
        values: emb,
        metadata: { text: batchChunks[j].slice(0, 1000) },
      }));

      // 3. Upsert the batch and free memory
      await upsertVectors(process.env.PINECONE_INDEX!, batchVectors);
      console.log(`Upserted batch ${i / batchSize + 1}/${Math.ceil(chunks.length / batchSize)}`);
    }

    // Clean up the uploaded file
    await fs.unlink(filePath);

    return res.json({
      message: "Uploaded & indexed successfully",
      chunks: chunks.length,
    });

  } catch (err) {
    console.error(err);
    // Ensure file deletion even on error
    try { await fs.unlink(filePath); } catch (cleanupErr) {
        console.warn("Failed to clean up file:", cleanupErr);
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;