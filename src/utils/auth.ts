import jwt from "jsonwebtoken";
import { Response } from "express";

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

export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string, rememberMe: boolean = true) => {
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  const refreshTokenOptions: any = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  if (rememberMe) {
    refreshTokenOptions.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  res.cookie("refreshToken", refreshToken, refreshTokenOptions);
};

export const clearAuthCookies = (res: Response) => {
  res.cookie("accessToken", "", { httpOnly: true, expires: new Date(0) });
  res.cookie("refreshToken", "", { httpOnly: true, expires: new Date(0) });
};
