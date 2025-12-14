import express from 'express';
import path from 'path';
import cors from 'cors';

import uploadRouter from './routes/upload';
import queryRouter from './routes/query';

const app = express();

// ⭐ Enable CORS for all frontend requests
app.use(cors());

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Serve Frontend
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Routes
app.use("/upload", uploadRouter);
app.use("/query", queryRouter);

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

export default app;
