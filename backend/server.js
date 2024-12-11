const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);

// Add CORS configuration for Socket.io
const io = socketIo(server, {
  cors: {
    origin: "https://rtc.gym-engine.com", // Change this to your frontend URL
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"], // optional, if you have custom headers
    credentials: true, // Optional, if you're dealing with credentials (cookies, etc.)
  },
});

app.use(express.static("public"));

// Define a custom namespace or route for WebSocket logic
const socketNamespace = io.of("/socket");

// Handle WebSocket connections in the custom namespace
socketNamespace.on("connection", (socket) => {
    console.log("A user connected to /socket: ", socket.id);
  
    // Join a room
    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      console.log(`${socket.id} joined room ${roomId}`);
      socket.to(roomId).emit("user-joined", socket.id); // Notify others in the room
    });
  
    // Relay signaling data
    socket.on("signal", (data) => {
      console.log("Relaying signal:", data);
      // Relay the signal to other users in the room
      socket.to(data.room).emit("signal", {
        sender: socket.id,
        ...data,
      });
    });
  
    // Handle text messages
    socket.on("message", (data) => {
      console.log("Relaying message:", data.message);
      socket.to(data.room).emit("message", data.message);
    });
  
    // Disconnect event
    socket.on("disconnect", () => {
      console.log("User disconnected from /socket: ", socket.id);
      socket.rooms.forEach((roomId) => {
        socket.to(roomId).emit("user-left", socket.id);
      });
    });
  });
  

// Start the server
server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
