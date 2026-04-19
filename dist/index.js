"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const routes_1 = require("./routes/routes");
const http_1 = require("http");
const db_1 = require("./utils/db");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL,
    credentials: true,
}));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json());
app.use("/api", routes_1.router);
const server = (0, http_1.createServer)(app);
const PORT = process.env.PORT || 5000;
async function startServer() {
    try {
        await db_1.prisma.$connect();
        console.log("✅ Successfully connected to the database");
        server.listen(PORT, () => {
            console.log(`✅ HTTP server running on http://localhost:${PORT}`);
        });
        const shutdown = async () => {
            console.log("🛑 Shutting down server...");
            await db_1.prisma.$disconnect();
            process.exit(0);
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
    }
    catch (error) {
        console.error("Failed to connect to the database:", error);
        process.exit(1);
    }
}
startServer();
