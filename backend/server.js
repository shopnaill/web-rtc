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

io.on("connection", (socket) => {
  console.log("A user connected: ", socket.id);

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
      // Handle offer (server should not directly create peer connections unless you're implementing a signaling server)
      await peerConnection.current.setRemoteDescription(data.offer);
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      socket.emit("signal", { room: data.room, answer });
    } else if (data.answer) {
      // Handle answer
      await peerConnection.current.setRemoteDescription(data.answer);
    } else if (data.candidate) {
      // Handle ICE candidate
      await peerConnection.current.addIceCandidate(data.candidate);
    }
  });

  // Handle text message
  socket.on("message", (data) => {
    io.to(data.room).emit("message", data.message);
  });

  // Disconnect event
  socket.on("disconnect", () => {
    console.log("User disconnected: ", socket.id);
    // Optionally, leave room on disconnect
    // For room-specific cleanup
    socket.rooms.forEach((roomId) => {
      socket.to(roomId).emit("user-left", socket.id);
    });
  });
});

// Start the server (change to https if using SSL)
server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
