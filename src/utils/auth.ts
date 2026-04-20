import jwt from "jsonwebtoken";
import { FastifyReply } from "fastify";

export const generateAccessToken = (userId: string): string => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || "default_secret", {
    expiresIn: "15m",
  });
};

export const generateRefreshToken = (userId: string): string => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET || "default_refresh_secret",
    {
      expiresIn: "7d",
    }
  );
};

export const setAuthCookies = (reply: FastifyReply, accessToken: string, refreshToken: string, rememberMe: boolean = true) => {
  reply.setCookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 15 * 60, // Fastify cookie maxAge is in SECONDS
  });

  const refreshTokenOptions: any = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  };

  if (rememberMe) {
    refreshTokenOptions.maxAge = 7 * 24 * 60 * 60; // 7 days (in seconds)
  }

  reply.setCookie("refreshToken", refreshToken, refreshTokenOptions);
};

export const clearAuthCookies = (reply: FastifyReply) => {
  reply.setCookie("accessToken", "", { httpOnly: true, path: "/", expires: new Date(0) });
  reply.setCookie("refreshToken", "", { httpOnly: true, path: "/", expires: new Date(0) });
};
