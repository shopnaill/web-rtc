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


// Global variable to keep track of queued offers and ICE candidates
let offerQueue = {};
let iceCandidateQueue = {};

// Handling incoming signaling messages
socket.on('signal', async (data) => {
  const { sender, offer, answer, candidate } = data;
  const peerConnection = peers.current[sender];

  if (offer) {
    try {
      // Check if the peer connection is in the 'stable' state
      if (peerConnection.signalingState === 'stable') {
        console.log(`Handling offer from ${sender} - signaling state is stable.`);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const localOffer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(localOffer);
        socket.emit('signal', { room, target: sender, offer: localOffer });
      } else {
        // Queue the offer if the peer connection is not in a stable state
        console.warn(`Offer from ${sender} queued due to signaling state: ${peerConnection.signalingState}`);
        offerQueue[sender] = offer;
      }
    } catch (err) {
      console.error(`Error handling offer from ${sender}:`, err);
    }
  }

  // Handle answer
  else if (answer) {
    try {
      if (peerConnection.signalingState === 'have-remote-description') {
        console.log(`Setting remote description for answer from ${sender}.`);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      } else {
        console.warn(`Ignoring answer from ${sender} due to incorrect signaling state.`);
      }
    } catch (err) {
      console.error(`Error handling answer from ${sender}:`, err);
    }
  }

  // Handle ICE candidates
  else if (candidate) {
    try {
      if (peerConnection.signalingState === 'stable') {
        console.log(`Adding ICE candidate from ${sender}.`);
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Queue ICE candidates if connection is not stable
        console.warn(`ICE candidate from ${sender} queued due to signaling state: ${peerConnection.signalingState}`);
        if (!iceCandidateQueue[sender]) {
          iceCandidateQueue[sender] = [];
        }
        iceCandidateQueue[sender].push(candidate);
      }
    } catch (err) {
      console.error(`Error handling ICE candidate from ${sender}:`, err);
    }
  }
});

// Monitor signaling state and process queued offers and ICE candidates
socket.on('signaling-state-changed', async (data) => {
  const { sender, state } = data;
  const peerConnection = peers.current[sender];

  if (state === 'stable') {
    // Process queued offer
    if (offerQueue[sender]) {
      try {
        const offer = offerQueue[sender];
        console.log(`Signaling state stable. Processing queued offer from ${sender}.`);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const localOffer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(localOffer);
        socket.emit('signal', { room, target: sender, offer: localOffer });
        delete offerQueue[sender];  // Clear the offer from the queue
        console.log(`Offer from ${sender} successfully processed.`);
      } catch (err) {
        console.error(`Error processing queued offer from ${sender}:`, err);
      }
    }

    // Process queued ICE candidates
    if (iceCandidateQueue[sender]) {
      try {
        console.log(`Processing queued ICE candidates for ${sender}.`);
        iceCandidateQueue[sender].forEach(async (candidate) => {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        });
        delete iceCandidateQueue[sender];  // Clear the candidate queue
        console.log(`All ICE candidates for ${sender} processed.`);
      } catch (err) {
        console.error(`Error processing ICE candidates for ${sender}:`, err);
      }
    }
  } else {
    console.log(`Signaling state not stable for ${sender}, will wait for stability.`);
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

// Process queued offers manually if needed
const processQueuedOffers = (peerId) => {
  if (offerQueue[peerId]) {
    const queuedOffer = offerQueue[peerId];
    delete offerQueue[peerId];

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

// Process queued ICE candidates manually if needed
const processQueuedIceCandidates = (peerId) => {
  if (iceCandidateQueue[peerId]) {
    iceCandidateQueue[peerId].forEach((candidate) => {
      peers.current[peerId].addIceCandidate(new RTCIceCandidate(candidate))
        .catch(err => console.error("Error processing ICE candidate:", err));
    });
    delete iceCandidateQueue[peerId];
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
