import React, { useRef, useState } from "react";
import io from "socket.io-client";

const socket = io("http://192.168.8.199:3000");

function VideoCall() {
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");
  const [isDataChannelOpen, setIsDataChannelOpen] = useState(false); // Track if DataChannel is open
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const peerConnection = useRef(null);
  const dataChannel = useRef(null);

  const joinRoom = () => {
    socket.emit("join-room", room);
    setupWebRTC();
  };

  const setupWebRTC = () => {
    peerConnection.current = new RTCPeerConnection();

    // Add local media stream to peer connection
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ video: true, audio: true })
          .then((stream) => {
            localVideo.current.srcObject = stream;
            stream.getTracks().forEach((track) => peerConnection.current.addTrack(track, stream));
          })
          .catch((error) => {
            console.error("Error accessing media devices:", error);
          });
      } else {
        console.error("getUserMedia is not supported in this browser.");
      }
      
    // Handle incoming tracks
    peerConnection.current.ontrack = (event) => {
      remoteVideo.current.srcObject = event.streams[0];
    };

    // Handle signaling messages
    socket.on("signal", async (data) => {
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

    // Handle ICE candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", { room, candidate: event.candidate });
      }
    };

    // Create a DataChannel for messaging
    dataChannel.current = peerConnection.current.createDataChannel("chat");

    // Listen for DataChannel open event and update state
    dataChannel.current.onopen = () => {
      console.log("DataChannel is open.");
      setIsDataChannelOpen(true); // Update state when DataChannel is open
    };

    dataChannel.current.onmessage = (event) => {
      alert(`Message: ${event.data}`);
    };
  };

  // Handle sending text messages
  const sendMessage = () => {
    if (isDataChannelOpen) {
      dataChannel.current.send(message);
      setMessage("");
    } else {
      console.error("DataChannel is not open. Cannot send message.");
      alert("Please wait for the connection to be established.");
    }
  };

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
