import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../utils/db";
import { generateAccessToken, generateRefreshToken, setAuthCookies, clearAuthCookies } from "../utils/auth";
import jwt from "jsonwebtoken";

// Zod Schemas
export const signupSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(1, "Password is required"),
    rememberMe: z.boolean().optional(),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email"),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
  params: z.object({
    resetToken: z.string().min(1, "Reset token is required"),
  }),
});

// Controllers
const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ success: false, message: "User already exists" });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Save refresh token to db
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email },
      accessToken,
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ success: false, message: "Internal server error during signup" });
  }
};

const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password, rememberMe } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ success: false, message: "Invalid credentials" });
    return;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    res.status(401).json({ success: false, message: "Invalid credentials" });
    return;
  }

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  setAuthCookies(res, accessToken, refreshToken, rememberMe);

  res.status(200).json({
    success: true,
    data: { id: user.id, name: user.name, email: user.email },
    accessToken,
  });
};

const refresh = async (req: Request, res: Response): Promise<void> => {
  const incomingRefreshToken = req.cookies.refreshToken;

  if (!incomingRefreshToken) {
    res.status(401).json({ success: false, message: "Refresh token not found" });
    return;
  }

  try {
    const decoded = jwt.verify(
      incomingRefreshToken,
      process.env.JWT_REFRESH_SECRET || "default_refresh_secret"
    ) as { id: string };

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: incomingRefreshToken },
    });

    if (!storedToken) {
      res.status(401).json({ success: false, message: "Invalid refresh token" });
      return;
    }

    const newAccessToken = generateAccessToken(decoded.id);
    const newRefreshToken = generateRefreshToken(decoded.id);

    // Rotate refresh token
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: decoded.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    setAuthCookies(res, newAccessToken, newRefreshToken);

    res.status(200).json({ success: true, accessToken: newAccessToken });
  } catch (error) {
    res.status(401).json({ success: false, message: "Invalid refresh token" });
  }
};

const logout = async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies.refreshToken;
  let accessToken = req.cookies.accessToken;

  if (!accessToken && req.headers.authorization?.startsWith("Bearer")) {
    accessToken = req.headers.authorization.split(" ")[1];
  }

  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }

  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as jwt.JwtPayload;
      if (decoded && decoded.exp) {
        await prisma.blacklistedToken.create({
          data: {
            token: accessToken,
            expiresAt: new Date(decoded.exp * 1000),
          },
        });
      }
    } catch (e) {
      // Ignored
    }
  }

  clearAuthCookies(res);
  res.status(200).json({ success: true, message: "Logged out" });
};

const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  await prisma.user.update({
    where: { email },
    data: {
      resetPasswordToken: hashedToken,
      resetPasswordExpire: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    },
  });

  // Since we don't have an email provider, we will log it to the console
  // and send it in the dev response for easier testing
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  console.log(`[Email Mock] Password reset URL for ${user.email}: \n${resetUrl}`);

  res.status(200).json({
    success: true,
    message: "Password reset link generated. Check console.",
    ...(process.env.NODE_ENV !== "production" && { resetUrl }),
  });
};

const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { resetToken } = req.params;
  const { password } = req.body;

  const hashedToken = crypto.createHash("sha256").update(String(resetToken)).digest("hex");

  const user = await prisma.user.findFirst({
    where: {
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { gt: new Date() },
    },
  });

  if (!user) {
    res.status(400).json({ success: false, message: "Invalid or expired token" });
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpire: null,
    },
  });

  // Optional: clear refresh tokens so other devices logged out
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

  res.status(200).json({ success: true, message: "Password reset successfully" });
};

export const authController = {
  signup,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
};
