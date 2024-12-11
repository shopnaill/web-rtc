const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);

// Add CORS configuration for Socket.io
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3001", // Allow requests from your frontend (change port if needed)
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
  socket.on("signal", async (data) => {
    console.log("Received signal:", data);
    if (data.offer) {
      await peerConnection.current.setRemoteDescription(data.offer);
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      socket.emit("signal", { room, answer });
    } else if (data.answer) {
      await peerConnection.current.setRemoteDescription(data.answer);
    } else if (data.candidate) {
      await peerConnection.current.addIceCandidate(data.candidate);
    }
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

server.listen(3000,() => {
  console.log("Server is running on http://localhost:3000");
});
