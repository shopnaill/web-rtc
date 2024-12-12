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
const rooms = {}; // Object to track rooms and their users

// Handle WebSocket connections in the custom namespace
socketNamespace.on("connection", (socket) => {
    console.log("A user connected to /socket: ", socket.id);
  
    // Handle joining a room
    socket.on("join-room", (roomId) => {
      socket.join(roomId);
  
      // Add the user to the room's user list
      if (!rooms[roomId]) {
        rooms[roomId] = [];
      }
      rooms[roomId].push(socket.id);
  
      console.log(`${socket.id} joined room ${roomId}`);
      console.log(`Current users in room ${roomId}:`, rooms[roomId]);
  
      // Notify the new user about all existing users in the room
      const otherUsers = rooms[roomId].filter((id) => id !== socket.id);
      socket.emit("room-users", otherUsers);
  
      // Notify existing users about the new user
      socket.to(roomId).emit("user-joined", socket.id);
    });
  
    // Relay signaling data
    socket.on("signal", (data) => {
      console.log("Relaying signal:", data);
      socket.to(data.target).emit("signal", { sender: socket.id, ...data });
    });
  
    // Handle disconnection
    socket.on("disconnect", () => {
      for (const roomId in rooms) {
        rooms[roomId] = rooms[roomId].filter((id) => id !== socket.id);
        socket.to(roomId).emit("user-left", socket.id);
        if (rooms[roomId].length === 0) {
          delete rooms[roomId];
        }
      }
    });
    


  });
  

// Start the server
server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
