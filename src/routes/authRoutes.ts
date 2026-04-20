import { FastifyPluginCallback } from "fastify";
import { authController, signupSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "../controllers/authController";

export const authRouter: FastifyPluginCallback = (fastify, options, done) => {
  const { signup, login, refresh, logout, forgotPassword, resetPassword } = authController;

  /**
   * @openapi
   * /auth/signup:
   *   post:
   *     summary: Register a new user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, email, password]
   *             properties:
   *               name: { type: string, example: "John Doe" }
   *               email: { type: string, example: "john@example.com" }
   *               password: { type: string, example: "password123" }
   *     responses:
   *       201:
   *         description: User created successfully
   */
  fastify.post("/signup", { schema: signupSchema }, signup);

  /**
   * @openapi
   * /auth/login:
   *   post:
   *     summary: Login user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password]
   *             properties:
   *               email: { type: string, example: "john@example.com" }
   *               password: { type: string, example: "password123" }
   *     responses:
   *       200:
   *         description: Login successful
   */
  fastify.post("/login", { schema: loginSchema }, login);

  /**
   * @openapi
   * /auth/refresh:
   *   post:
   *     summary: Refresh access token
   *     tags: [Auth]
   *     responses:
   *       200:
   *         description: Token refreshed
   */
  fastify.post("/refresh", refresh);

  /**
   * @openapi
   * /auth/logout:
   *   post:
   *     summary: Logout user
   *     tags: [Auth]
   *     responses:
   *       200:
   *         description: Logged out successfully
   */
  fastify.post("/logout", logout);

  /**
   * @openapi
   * /auth/forgot-password:
   *   post:
   *     summary: Request password reset link
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email]
   *             properties:
   *               email: { type: string, example: "john@example.com" }
   *     responses:
   *       200:
   *         description: Reset link generated
   */
  fastify.post("/forgot-password", { schema: forgotPasswordSchema }, forgotPassword);

  /**
   * @openapi
   * /auth/reset-password/{resetToken}:
   *   post:
   *     summary: Reset password using token
   *     tags: [Auth]
   *     parameters:
   *       - in: path
   *         name: resetToken
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [password]
   *             properties:
   *               password: { type: string, example: "newpassword123" }
   *     responses:
   *       200:
   *         description: Password reset successful
   */
  fastify.post("/reset-password/:resetToken", { schema: resetPasswordSchema }, resetPassword);

  done();
};
