import { FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";

export const errorHandler = (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  if (process.env.NODE_ENV !== "production") {
    request.log.error(error);
  }

  // Handle Zod Validation Errors (from fastify-type-provider-zod)
  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      message: "Validation Error",
      errors: error.issues,
    });
  }

  // Handle Fastify validation errors if they aren't ZodErrors
  if (error.validation) {
    return reply.status(400).send({
      success: false,
      message: "Validation Error",
      errors: error.validation,
    });
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal Server Error";

  return reply.status(statusCode).send({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: error.stack }),
  });
};
