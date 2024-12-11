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
    socket.to(roomId).emit("user-joined", socket.id);
  });

  // Handle signaling messages for WebRTC
  socket.on("signal", async (data) => {
    console.log("Received signal:", data);
    // Make sure peerConnection is initialized in your server logic before this
    if (data.offer) {
      await peerConnection.current.setRemoteDescription(data.offer);
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      socket.emit("signal", { room: data.room, answer });
    } else if (data.answer) {
      await peerConnection.current.setRemoteDescription(data.answer);
    } else if (data.candidate) {
      await peerConnection.current.addIceCandidate(data.candidate);
    }
  });

  // Handle text messages
  socket.on("message", (data) => {
    socketNamespace.to(data.room).emit("message", data.message);
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
