import React, { useRef, useState } from "react";
import io from "socket.io-client";

const socket = io("https://rtc.gym-engine.com");

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

    // Get media stream and add to peer connection
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localVideo.current.srcObject = stream;
        stream.getTracks().forEach((track) => peerConnection.current.addTrack(track, stream));

        // Log local stream
        console.log("Local Stream: ", localVideo.current.srcObject);
      })
      .catch((error) => {
        console.error("Error accessing media devices:", error);
        alert("Unable to access media devices. Please check your camera and microphone.");
      });

    // Handle incoming tracks
    peerConnection.current.ontrack = (event) => {
      console.log("Received remote stream:", event);

      remoteVideo.current.srcObject = event.streams[0];
      // Log remote stream
      console.log("Remote Stream: ", remoteVideo.current.srcObject);
    };

    // Handle signaling process (offer, answer, candidate)
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

    // Create DataChannel
    dataChannel.current = peerConnection.current.createDataChannel("chat");

    // Handle DataChannel events
    dataChannel.current.onopen = () => {
      console.log("DataChannel is open.");
      setIsDataChannelOpen(true);
    };

    dataChannel.current.onmessage = (event) => {
      alert(`Message: ${event.data}`);
    };
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
