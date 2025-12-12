"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const upload_1 = __importDefault(require("./routes/upload"));
const query_1 = __importDefault(require("./routes/query"));
const app = (0, express_1.default)();
// Parse JSON bodies
app.use(express_1.default.json({ limit: '10mb' }));
// Serve uploaded files
app.use("/uploads", express_1.default.static(path_1.default.join(__dirname, "..", "uploads")));
// Routes
app.use("/upload", upload_1.default);
app.use("/query", query_1.default);
// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
exports.default = app;
