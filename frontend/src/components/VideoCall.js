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
    peerConnection.current = new RTCPeerConnection();
  
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localVideo.current.srcObject = stream;
        stream.getTracks().forEach((track) => peerConnection.current.addTrack(track, stream));
      })
      .catch((error) => {
        console.error("Error accessing media devices:", error);
        alert("Unable to access media devices. Please check your camera and microphone.");
      });
  
    peerConnection.current.ontrack = (event) => {
      remoteVideo.current.srcObject = event.streams[0];
    };
  
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", { room, candidate: event.candidate });
      }
    };
  
    // Handle signaling messages
    socket.on("signal", async (data) => {
      if (data.sender === socket.id) return; // Ignore self-sent signals
  
      if (data.offer) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        socket.emit("signal", { room, answer });
      } else if (data.answer) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      } else if (data.candidate) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });
  
    // When a new user joins, send them an offer
    socket.on("user-joined", async () => {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      socket.emit("signal", { room, offer });
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
