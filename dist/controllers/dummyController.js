"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dummyController = void 0;
const todos = [
    { id: 1, title: "Learn Node.js", completed: false },
    { id: 2, title: "Build an API", completed: true },
    { id: 3, title: "Connect with Frontend", completed: false },
];
const fetchAllTodo = async (req, res) => {
    try {
        res.status(200).json({ success: true, data: todos });
    }
    catch (error) {
        console.error("Error fetching TODO items:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};
exports.dummyController = {
    fetchAllTodo,
};
