import React, { useRef, useState, useEffect } from "react";
import io from "socket.io-client";

const socket = io("wss://rtc.gym-engine.com/socket");

function VideoCall() {
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");
  const [isDataChannelOpen, setIsDataChannelOpen] = useState(false);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const peerConnection = useRef(null);
  const dataChannel = useRef(null);

  const joinRoom = () => {
    if (!room) {
      alert("Please enter a room code");
      return;
    }
    socket.emit("join-room", room);
    setupWebRTC();
  };

  const setupWebRTC = () => {
    const peers = {}; // To manage peer connections with all users
  
    const createPeerConnection = (targetId) => {
      const peerConnection = new RTCPeerConnection();
  
      // Handle local tracks
      localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
  
      // Handle remote tracks
      peerConnection.ontrack = (event) => {
        // Append remote streams to a video element dynamically
        const remoteVideo = document.createElement("video");
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.autoplay = true;
        document.body.appendChild(remoteVideo);
      };
  
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("signal", {
            room,
            target: targetId,
            candidate: event.candidate,
          });
        }
      };
  
      return peerConnection;
    };
  
    // Setup local media stream
    let localStream;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStream = stream;
        const localVideo = document.getElementById("localVideo");
        localVideo.srcObject = stream;
      })
      .catch((err) => console.error("Error accessing media devices:", err));
  
    // Handle existing users in the room
    socket.on("room-users", (users) => {
      users.forEach(async (userId) => {
        const peerConnection = createPeerConnection(userId);
        peers[userId] = peerConnection;
  
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
  
        socket.emit("signal", { room, target: userId, offer });
      });
    });
  
    // Handle new user joining
    socket.on("user-joined", async (userId) => {
      const peerConnection = createPeerConnection(userId);
      peers[userId] = peerConnection;
  
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
  
      socket.emit("signal", { room, target: userId, offer });
    });
  
    // Handle signaling messages
    socket.on("signal", async (data) => {
      const { sender, offer, answer, candidate } = data;
  
      if (!peers[sender]) {
        peers[sender] = createPeerConnection(sender);
      }
  
      const peerConnection = peers[sender];
  
      if (offer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("signal", { room, target: sender, answer });
      } else if (answer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      } else if (candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });
  
    // Handle user leaving
    socket.on("user-left", (userId) => {
      if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
      }
      console.log(`${userId} left the room`);
    });
  };
  
  

  const sendMessage = () => {
    if (isDataChannelOpen) {
      dataChannel.current.send(message);
      setMessage("");
    } else {
      console.error("DataChannel is not open. Cannot send message.");
      alert("Please wait for the connection to be established.");
    }
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      if (dataChannel.current) {
        dataChannel.current.close();
      }
    };
  }, []);

  return (
    <div>
      <div>
        <input
          type="text"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Enter Room Code"
        />
        <button onClick={joinRoom}>Join Room</button>
      </div>

      <div>
        <video ref={localVideo} autoPlay muted playsInline />
        <video ref={remoteVideo} autoPlay playsInline />
      </div>

      <div>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message"
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default VideoCall;
