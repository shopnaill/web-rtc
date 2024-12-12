import React, { useRef, useState, useEffect } from "react";
import io from "socket.io-client";

// Initialize the socket connection
const socket = io("wss://rtc.gym-engine.com/socket");

function VideoCall() {
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");
  const [isDataChannelOpen, setIsDataChannelOpen] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const localVideo = useRef(null);
  const peers = useRef({});
  const dataChannel = useRef(null);

  const offerQueue = useRef({});
  const iceCandidateQueue = useRef({});

  // Join an existing room
  const joinRoom = () => {
    if (!room) {
      alert("Please enter a room code");
      return;
    }
    socket.emit("join-room", room);
    setupWebRTC();
  };

  // Create a new room with a random ID
  const createRoom = () => {
    const newRoom = Math.random().toString(36).substring(2, 7); // Generate random room ID
    setRoom(newRoom);
    socket.emit("join-room", newRoom);
    setupWebRTC();
  };

  // Setup WebRTC for the local and remote peers
  const setupWebRTC = () => {
    let localStream = null;

    // Create a new peer connection
    const createPeerConnection = (targetId) => {
      const peerConnection = new RTCPeerConnection();

      // Add local tracks to the peer connection
      localStream?.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

      // When a remote stream is received, add it to the state
      peerConnection.ontrack = (event) => {
        setRemoteStreams((prevStreams) => [...prevStreams, event.streams[0]]);
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          if (peerConnection.iceConnectionState !== "connected" && peerConnection.iceConnectionState !== "completed") {
            iceCandidateQueue.current[targetId] = iceCandidateQueue.current[targetId] || [];
            iceCandidateQueue.current[targetId].push(event.candidate);
          } else {
            socket.emit("signal", { room, target: targetId, candidate: event.candidate });
          }
        }
      };

      // Handle state changes in the ICE connection
      peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === "failed") {
          console.error(`ICE connection failed with ${targetId}`);
        }
      };

      // Handle signaling state change
      peerConnection.onsignalingstatechange = () => {
        if (peerConnection.signalingState === "stable") {
          processQueuedOffers(targetId);
          processQueuedIceCandidates(targetId);
        }
      };

      return peerConnection;
    };

    // Get the user's media (audio and video)
    navigator.mediaDevices
      .getUserMedia({ video: !isVideoOff, audio: !isMuted })
      .then((stream) => {
        localStream = stream;
        if (localVideo.current) {
          localVideo.current.srcObject = stream;
        }
      })
      .catch((err) => console.error("Error accessing media devices:", err));

    // Listen for room users to connect and establish peer connections
    socket.on("room-users", (users) => {
      users.forEach(async (userId) => {
        const peerConnection = createPeerConnection(userId);
        peers.current[userId] = peerConnection;

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit("signal", { room, target: userId, offer });
      });
    });

    // Handle new user joining the room
    socket.on("user-joined", async (userId) => {
      const peerConnection = createPeerConnection(userId);
      peers.current[userId] = peerConnection;

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit("signal", { room, target: userId, offer });
    });

    // Handle incoming signals (offers, answers, candidates)
socket.on("signal", async (data) => {
  const { sender, offer, answer, candidate } = data;

  if (!peers.current[sender]) {
    peers.current[sender] = createPeerConnection(sender);
  }

  const peerConnection = peers.current[sender];

  // Handle offer
  if (offer) {
    try {
      if (peerConnection.signalingState === "stable") {
        // If signaling state is 'stable', set remote description and create an offer
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const localOffer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(localOffer);
        socket.emit("signal", { room, target: sender, offer: localOffer });
      } else {
        // Queue the offer if not in 'stable' state
        offerQueue.current[sender] = offer;
        console.warn("Offer queued due to signaling state: " + peerConnection.signalingState);
      }
    } catch (err) {
      console.error("Error handling offer:", err);
    }
  }

  // Handle answer
  else if (answer) {
    try {
      if (peerConnection.signalingState === "have-remote-description") {
        // If remote description is already set, set the local description with the answer
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      } else {
        console.warn("Ignoring answer due to incorrect signaling state.");
      }
    } catch (err) {
      console.error("Error handling answer: ", err);
    }
  }

  // Handle ICE candidate
  else if (candidate) {
    try {
      if (peerConnection.signalingState === "stable" || peerConnection.signalingState === "have-remote-description") {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        iceCandidateQueue.current[sender] = iceCandidateQueue.current[sender] || [];
        iceCandidateQueue.current[sender].push(candidate);
        console.warn("ICE candidate queued, not in stable state.");
      }
    } catch (err) {
      console.error("Error handling ICE candidate: ", err);
    }
  }
});


    // Handle user leaving the room
    socket.on("user-left", (userId) => {
      if (peers.current[userId]) {
        peers.current[userId].close();
        delete peers.current[userId];
      }
      console.log(`${userId} left the room`);
    });
  };

  // Send a message to the data channel
  const sendMessage = () => {
    if (isDataChannelOpen) {
      dataChannel.current.send(message);
      setMessage("");
    } else {
      console.error("DataChannel is not open. Cannot send message.");
      alert("Please wait for the connection to be established.");
    }
  };

  // Toggle audio mute
  const toggleAudio = () => {
    setIsMuted((prev) => !prev);
    localVideo.current.srcObject.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
  };

  // Toggle video on/off
  const toggleVideo = () => {
    setIsVideoOff((prev) => !prev);
    localVideo.current.srcObject.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
  };

  // End the video call
  const endCall = () => {
    socket.emit("user-left", room);
    Object.values(peers.current).forEach((peerConnection) =>
      peerConnection.close()
    );
    socket.disconnect();
  };

  // Process queued offers
  const processQueuedOffers = (peerId) => {
    if (offerQueue.current[peerId]) {
      const queuedOffer = offerQueue.current[peerId];
      delete offerQueue.current[peerId];

      peers.current[peerId].setRemoteDescription(new RTCSessionDescription(queuedOffer))
        .then(() => peers.current[peerId].createAnswer())
        .then(answer => {
          return peers.current[peerId].setLocalDescription(answer);
        })
        .then(() => {
          socket.emit("signal", { room, target: peerId, answer });
        })
        .catch(err => {
          console.error("Error processing queued offer: ", err);
        });
    }
  };

  // Process queued ICE candidates
  const processQueuedIceCandidates = (peerId) => {
    if (iceCandidateQueue.current[peerId]) {
      iceCandidateQueue.current[peerId].forEach((candidate) => {
        peers.current[peerId].addIceCandidate(new RTCIceCandidate(candidate))
          .catch(err => console.error("Error processing ICE candidate:", err));
      });
      delete iceCandidateQueue.current[peerId];
    }
  };

  return (
    <div>
      <div>
        <button onClick={createRoom}>Create Room</button>
        <input
          type="text"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
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
        <video ref={localVideo} autoPlay muted></video>
        {remoteStreams.map((stream, index) => (
          <video key={index} autoPlay playsInline srcObject={stream}></video>
        ))}
      </div>

      <div>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button onClick={sendMessage}>Send Message</button>
      </div>

      <button onClick={endCall}>End Call</button>
    </div>
  );
}

export default VideoCall;
