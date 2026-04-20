import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import dotenvFlow from "dotenv-flow";
import { router } from "./routes/routes";
import { prisma } from "./utils/db";
import { errorHandler } from "./middlewares/errorHandler";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";

dotenvFlow.config();

const fastify = Fastify({
  logger: {
    level: "info",
    transport: {
      target: "pino-pretty",
    },
  },
}).withTypeProvider<ZodTypeProvider>();

// Zod Validation Setup
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

// Middleware/Plugins
fastify.register(cors, {
  origin: [process.env.FRONTEND_URL || "http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true,
});

fastify.register(cookie, {
  secret: process.env.COOKIE_SECRET || "default_cookie_secret",
  parseOptions: {},
});

fastify.register(jwt, {
  secret: process.env.JWT_SECRET || "default_secret",
});

// Swagger Documentation
fastify.register(swagger, {
  openapi: {
    info: {
      title: "Backend Starter API Docs",
      description: "Fastify-based API documentation",
      version: "1.0.0",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}/api`,
      },
    ],
  },
});

fastify.register(swaggerUi, {
  routePrefix: "/api-docs",
});

// Request Logging
fastify.addHook("onRequest", async (request) => {
  request.log.info({ method: request.method, url: request.url }, "Incoming request");
});

// API Routes
fastify.register(router, { prefix: "/api" });

// Error Handling
fastify.setErrorHandler(errorHandler);

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    await prisma.$connect();
    fastify.log.info("✅ Successfully connected to the database");

    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    fastify.log.info(`✅ Fastify server running on http://localhost:${PORT}`);

  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Graceful Shutdown
const shutdown = async () => {
  fastify.log.info("🛑 Shutting down server...");
  await prisma.$disconnect();
  await fastify.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();
