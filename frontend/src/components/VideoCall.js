import React, { useRef, useState, useEffect } from "react";
import io from "socket.io-client";

// Initialize the socket connection
const socket = io("wss://rtc.gym-engine.com/socket");

function VideoCall() {
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const localVideo = useRef(null);
  const localStream = useRef(null);
  const peers = useRef({});
  const dataChannels = useRef({});

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // Add TURN servers if needed for better connectivity
      // { 
      //   urls: 'turn:your-turn-server.com', 
      //   username: 'your-username', 
      //   credential: 'your-password' 
      // }
    ]
  };

  // Create a new room with a random ID
  const createRoom = async () => {
    const newRoom = Math.random().toString(36).substring(2, 7);
    setRoom(newRoom);
    await setupLocalMedia();
    socket.emit("join-room", newRoom);
  };

  // Join an existing room
  const joinRoom = async () => {
    if (!room) {
      alert("Please enter a room code");
      return;
    }
    await setupLocalMedia();
    socket.emit("join-room", room);
  };

  // Setup local media stream
  const setupLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: !isVideoOff,
        audio: !isMuted
      });
      localStream.current = stream;
      if (localVideo.current) {
        localVideo.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing media devices:", err);
      alert("Could not access camera or microphone");
    }
  };

  // Create a peer connection
  const createPeerConnection = (targetId) => {
    try {
      const peerConnection = new RTCPeerConnection(configuration);

      // Add local tracks to the peer connection
      localStream.current?.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream.current);
      });

      // Create data channel
      const dataChannel = peerConnection.createDataChannel("chat");
      dataChannel.onopen = () => {
        console.log(`Data channel opened with ${targetId}`);
      };
      dataChannel.onmessage = (event) => {
        console.log(`Message from ${targetId}:`, event.data);
        // Handle received messages as needed
      };
      dataChannels.current[targetId] = dataChannel;

      // Handle remote tracks
      peerConnection.ontrack = (event) => {
        setRemoteStreams((prevStreams) => {
          // Avoid adding duplicate streams
          const isNewStream = !prevStreams.some(
            (stream) => stream.id === event.streams[0].id
          );
          return isNewStream 
            ? [...prevStreams, event.streams[0]] 
            : prevStreams;
        });
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("signal", { 
            room, 
            target: targetId, 
            candidate: event.candidate 
          });
        }
      };

      return peerConnection;
    } catch (error) {
      console.error("Error creating peer connection:", error);
      return null;
    }
  };

  // Establish connection with a peer
  const connectToPeer = async (targetId) => {
    try {
      const peerConnection = createPeerConnection(targetId);
      if (!peerConnection) return;

      peers.current[targetId] = peerConnection;

      // Create offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      // Send offer to the target
      socket.emit("signal", { room, target: targetId, offer });
    } catch (error) {
      console.error("Error connecting to peer:", error);
    }
  };

  // Socket event listeners
  useEffect(() => {
    // Listen for room users
    const handleRoomUsers = (users) => {
      users.forEach((userId) => {
        if (!peers.current[userId]) {
          connectToPeer(userId);
        }
      });
    };

    // Handle new user joining
    const handleUserJoined = (userId) => {
      if (!peers.current[userId]) {
        connectToPeer(userId);
      }
    };

    // Handle signaling messages
    const handleSignal = async (data) => {
      const { sender, offer, answer, candidate } = data;
      let peerConnection = peers.current[sender];

      try {
        if (offer) {
          // If no existing peer connection, create one
          if (!peerConnection) {
            peerConnection = createPeerConnection(sender);
            peers.current[sender] = peerConnection;
          }

          // Set remote description
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(offer)
          );

          // Create and send answer
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.emit("signal", { room, target: sender, answer });
        }

        if (answer) {
          // Set remote description for the answer
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
        }

        if (candidate) {
          // Add ICE candidate
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        }
      } catch (error) {
        console.error("Error handling signal:", error);
      }
    };

    // Handle user leaving
    const handleUserLeft = (userId) => {
      if (peers.current[userId]) {
        peers.current[userId].close();
        delete peers.current[userId];
        
        // Remove remote stream for the left user
        setRemoteStreams((prevStreams) => 
          prevStreams.filter((stream) => 
            stream.id !== userId
          )
        );
      }
    };

    // Add socket listeners
    socket.on("room-users", handleRoomUsers);
    socket.on("user-joined", handleUserJoined);
    socket.on("signal", handleSignal);
    socket.on("user-left", handleUserLeft);

    // Cleanup listeners on unmount
    return () => {
      socket.off("room-users", handleRoomUsers);
      socket.off("user-joined", handleUserJoined);
      socket.off("signal", handleSignal);
      socket.off("user-left", handleUserLeft);
    };
  }, [room]);

  // Toggle audio mute
  const toggleAudio = () => {
    setIsMuted((prev) => {
      const newMuteState = !prev;
      localStream.current?.getAudioTracks().forEach((track) => {
        track.enabled = !newMuteState;
      });
      return newMuteState;
    });
  };

  // Toggle video on/off
  const toggleVideo = () => {
    setIsVideoOff((prev) => {
      const newVideoState = !prev;
      localStream.current?.getVideoTracks().forEach((track) => {
        track.enabled = !newVideoState;
      });
      return newVideoState;
    });
  };

  // Send a message via data channel
  const sendMessage = () => {
    // Send message to all connected peers
    Object.values(dataChannels.current).forEach((channel) => {
      if (channel.readyState === 'open') {
        channel.send(message);
      }
    });
    setMessage("");
  };

  // End the video call
  const endCall = () => {
    // Close all peer connections
    Object.values(peers.current).forEach((peerConnection) => {
      peerConnection.close();
    });

    // Stop local media tracks
    localStream.current?.getTracks().forEach((track) => track.stop());

    // Reset state
    setRemoteStreams([]);
    peers.current = {};
    dataChannels.current = {};

    // Disconnect from socket
    socket.emit("user-left", room);
    socket.disconnect();
  };

  return (
    <div>
      <div>
        <button onClick={createRoom}>Create Room</button>
        <input
          type="text"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Room Code"
        />
        <button onClick={joinRoom}>Join Room</button>
      </div>

      <div>
        <button onClick={toggleAudio}>
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button onClick={toggleVideo}>
          {isVideoOff ? "Turn Video On" : "Turn Video Off"}
        </button>
      </div>

      <div>
        <video 
          ref={localVideo} 
          autoPlay 
          muted 
          style={{ width: '200px', border: '1px solid black' }}
        ></video>
        {remoteStreams.map((stream, index) => (
          <video 
            key={stream.id} 
            srcObject={stream} 
            autoPlay 
            playsInline
            style={{ width: '200px', border: '1px solid black' }}
          ></video>
        ))}
      </div>

      <div>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message"
        />
        <button onClick={sendMessage}>Send Message</button>
      </div>

      <button onClick={endCall}>End Call</button>
    </div>
  );
}

export default VideoCall;