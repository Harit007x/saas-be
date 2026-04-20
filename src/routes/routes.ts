import { FastifyPluginCallback } from "fastify";
import { dummyController } from "../controllers/dummyController";
import { authRouter } from "./authRoutes";

export const router: FastifyPluginCallback = (fastify, options, done) => {
  const { fetchAllTodo } = dummyController;

  /**
   * @openapi
   * /todos:
   *   get:
   *     summary: Fetch all todos (Dummy endpoint)
   *     tags: [General]
   *     responses:
   *       200:
   *         description: List of todos returned successfully
   */
  fastify.get("/todos", fetchAllTodo);
  
  fastify.register(authRouter, { prefix: "/auth" });

  done();
};
