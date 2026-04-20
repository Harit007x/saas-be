import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/db";

interface JwtPayload {
  id: string;
}

import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: {
      id: string;
      name: string;
      email: string;
    };
  }
}

export const protect = async (request: FastifyRequest, reply: FastifyReply) => {
  let token;

  if (request.cookies.accessToken) {
    token = request.cookies.accessToken;
  } else if (request.headers.authorization && request.headers.authorization.startsWith("Bearer")) {
    token = request.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return reply.status(401).send({ success: false, message: "Not authorized to access this route" });
  }

  try {
    // Check if token is blacklisted
    const isBlacklisted = await prisma.blacklistedToken.findUnique({
      where: { token },
    });

    if (isBlacklisted) {
      return reply.status(401).send({ success: false, message: "Token has been revoked" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_secret") as JwtPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, email: true }, // Don't return password
    });

    if (!user) {
      return reply.status(401).send({ success: false, message: "User belonging to this token no longer exists" });
    }

    request.user = user;
    // Fastify preHandlers don't call next(), they just return or throw
  } catch (error) {
    return reply.status(401).send({ success: false, message: "Not authorized to access this route" });
  }
};
