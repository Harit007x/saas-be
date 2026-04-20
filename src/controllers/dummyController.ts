import { FastifyRequest, FastifyReply } from 'fastify';

const todos = [
  { id: 1, title: "Learn Node.js", completed: false },
  { id: 2, title: "Build an API", completed: true },
  { id: 3, title: "Connect with Frontend", completed: false },
];

const fetchAllTodo = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return reply.status(200).send({ success: true, data: todos });
  } catch (error) {
    console.error("Error fetching TODO items:", error);
    return reply.status(500).send({ success: false, error: "Internal Server Error" });
  }
};

export const dummyController = {
    fetchAllTodo,
};