const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);

// Add CORS configuration for Socket.io
const io = socketIo(server, {
  cors: {
    origin: "http://192.168.8.199:3001", // Allow requests from your frontend (change port if needed)
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"], // optional, if you have custom headers
    credentials: true, // Optional, if you're dealing with credentials (cookies, etc.)
  },
});

app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("A user connected: ", socket.id);

  // Join a room
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", socket.id);
  });

  // Handle signaling messages
  socket.on("signal", (data) => {
    socket.to(data.room).emit("signal", data);
  });

  // Handle text message
  socket.on("message", (data) => {
    io.to(data.room).emit("message", data.message);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected: ", socket.id);
  });
});

server.listen(3000, "192.168.8.199",() => {
  console.log("Server is running on http://192.168.8.199:3000");
});
