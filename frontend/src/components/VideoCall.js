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
  const [connectionStatus, setConnectionStatus] = useState("Disconnected");

  const localVideo = useRef(null);
  const localStream = useRef(null);
  const peers = useRef({});
  const dataChannels = useRef({});
  const pendingOffers = useRef({});

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
      // Add TURN servers here if needed for better connectivity
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
    socket.connect(); // Ensure socket is connected
    socket.emit("join-room", newRoom);
    setConnectionStatus("Connecting...");
  };

  // Join an existing room
  const joinRoom = async () => {
    if (!room) {
      alert("Please enter a room code");
      return;
    }
    await setupLocalMedia();
    socket.connect(); // Ensure socket is connected
    socket.emit("join-room", room);
    setConnectionStatus("Connecting...");
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
      const dataChannel = peerConnection.createDataChannel("chat", {
        negotiated: true,
        id: 0
      });
      
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

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state with ${targetId}: ${peerConnection.connectionState}`);
        
        switch(peerConnection.connectionState) {
          case "connected":
            setConnectionStatus("Connected");
            break;
          case "disconnected":
          case "failed":
            setConnectionStatus("Disconnected");
            break;
        }
      };

      // Handle signaling state changes
      peerConnection.onsignalingstatechange = () => {
        console.log(`Signaling state: ${peerConnection.signalingState}`);
        
        // Process any pending offers when state becomes stable
        if (peerConnection.signalingState === 'stable' && pendingOffers.current[targetId]) {
          processPendingOffer(targetId);
        }
      };

      return peerConnection;
    } catch (error) {
      console.error("Error creating peer connection:", error);
      return null;
    }
  };

  // Process a pending offer
  const processPendingOffer = async (targetId) => {
    const pendingOffer = pendingOffers.current[targetId];
    if (!pendingOffer) return;

    try {
      const peerConnection = peers.current[targetId];
      if (!peerConnection) return;

      // Ensure we're in the right state before setting remote description
      if (peerConnection.signalingState !== 'stable') {
        console.log(`Cannot process offer, current state: ${peerConnection.signalingState}`);
        return;
      }

      // Set remote description
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(pendingOffer)
      );

      // Create and send answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      socket.emit("signal", { room, target: targetId, answer });

      // Clear the pending offer
      delete pendingOffers.current[targetId];
    } catch (error) {
      console.error(`Error processing pending offer for ${targetId}:`, error);
    }
  };

  // Establish connection with a peer
  const connectToPeer = async (targetId) => {
    try {
      // If peer connection already exists, don't create another
      if (peers.current[targetId]) {
        console.log(`Peer connection with ${targetId} already exists`);
        return;
      }

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
    // Prevent multiple listeners
    socket.off("room-users");
    socket.off("user-joined");
    socket.off("signal");
    socket.off("user-left");

    // Handle room users
    const handleRoomUsers = (users) => {
      console.log("Room users:", users);
      users.forEach((userId) => {
        if (!peers.current[userId]) {
          connectToPeer(userId);
        }
      });
    };

    // Handle new user joining
    const handleUserJoined = (userId) => {
      console.log(`User joined: ${userId}`);
      if (!peers.current[userId]) {
        connectToPeer(userId);
      }
    };

    // Handle signaling messages
    const handleSignal = async (data) => {
      const { sender, offer, answer, candidate } = data;
      let peerConnection = peers.current[sender];

      try {
        // Handle offer
        if (offer) {
          // If no existing peer connection, create one
          if (!peerConnection) {
            peerConnection = createPeerConnection(sender);
            peers.current[sender] = peerConnection;
          }

          // If not in stable state, queue the offer
          if (peerConnection.signalingState !== 'stable') {
            console.log(`Queueing offer from ${sender}, current state: ${peerConnection.signalingState}`);
            pendingOffers.current[sender] = offer;
            return;
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

        // Handle answer
        if (answer) {
          // Ensure peer connection exists
          if (!peerConnection) {
            console.error(`No peer connection for ${sender} when receiving answer`);
            return;
          }

          // Check signaling state before setting remote description
          if (peerConnection.signalingState !== 'stable') {
            console.log(`Cannot set answer, current state: ${peerConnection.signalingState}`);
            return;
          }

          // Set remote description for the answer
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
        }

        // Handle ICE candidate
        if (candidate) {
          if (!peerConnection) {
            console.error(`No peer connection for ${sender} when receiving candidate`);
            return;
          }

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
      console.log(`User left: ${userId}`);
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
    Object.entries(dataChannels.current).forEach(([peerId, channel]) => {
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
    setConnectionStatus("Disconnected");

    // Disconnect from socket
    socket.emit("user-left", room);
    socket.disconnect();
  };

  return (
    <div className="video-call-container">
      <div className="connection-controls">
        <input
          type="text"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Room Code"
        />
        <button onClick={createRoom}>Create Room</button>
        <button onClick={joinRoom}>Join Room</button>
        <div>Connection Status: {connectionStatus}</div>
      </div>

      <div className="video-controls">
        <button onClick={toggleAudio}>
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button onClick={toggleVideo}>
          {isVideoOff ? "Turn Video On" : "Turn Video Off"}
        </button>
      </div>

      <div className="video-grid">
        <div className="local-video">
          <video 
            ref={localVideo} 
            autoPlay 
            muted 
            style={{ width: '200px', border: '1px solid black' }}
          />
          <span>Local Video</span>
        </div>

        {remoteStreams.map((stream, index) => (
          <div key={stream.id} className="remote-video">
            <video 
              srcObject={stream} 
              autoPlay 
              playsInline
              style={{ width: '200px', border: '1px solid black' }}
            />
            <span>Remote Video {index + 1}</span>
          </div>
        ))}
      </div>

      <div className="messaging-controls">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message"
        />
        <button onClick={sendMessage}>Send Message</button>
      </div>

      <div className="call-controls">
        <button onClick={endCall}>End Call</button>
      </div>
    </div>
  );
}

export default VideoCall;