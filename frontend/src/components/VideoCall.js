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

  const joinRoom = () => {
    if (!room) {
      alert("Please enter a room code");
      return;
    }
    socket.emit("join-room", room);
    setupWebRTC();
  };

  const createRoom = () => {
    const newRoom = Math.random().toString(36).substring(2, 7); // Generate random room ID
    setRoom(newRoom);
    socket.emit("join-room", newRoom);
    setupWebRTC();
  };

  const setupWebRTC = () => {
    let localStream = null;

    const createPeerConnection = (targetId) => {
        const peerConnection = new RTCPeerConnection();

        localStream?.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            setRemoteStreams((prevStreams) => [...prevStreams, event.streams[0]]);
        };

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

    navigator.mediaDevices
        .getUserMedia({ video: !isVideoOff, audio: !isMuted })
        .then((stream) => {
            localStream = stream;
            if (localVideo.current) {
                localVideo.current.srcObject = stream;
            }
        })
        .catch((err) => console.error("Error accessing media devices:", err));

    socket.on("room-users", (users) => {
        users.forEach(async (userId) => {
            const peerConnection = createPeerConnection(userId);
            peers.current[userId] = peerConnection;

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            socket.emit("signal", { room, target: userId, offer });
        });
    });

    socket.on("user-joined", async (userId) => {
        const peerConnection = createPeerConnection(userId);
        peers.current[userId] = peerConnection;

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit("signal", { room, target: userId, offer });
    });

    socket.on("signal", async (data) => {
      const { sender, offer, answer, candidate } = data;
      
      if (!peers.current[sender]) {
          peers.current[sender] = createPeerConnection(sender);
      }
      
      const peerConnection = peers.current[sender];
      
      if (offer) {
          try {
              // Check if signaling state is stable before setting remote description
              if (peerConnection.signalingState === "stable") {
                  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                  const answer = await peerConnection.createAnswer();
                  await peerConnection.setLocalDescription(answer);
                  socket.emit("signal", { room, target: sender, answer });
              } else {
                  console.warn("Peer connection is not in stable state, offer ignored temporarily.");
              }
          } catch (err) {
              console.error("Error handling offer: ", err);
          }
      } else if (answer) {
          try {
              if (peerConnection.signalingState === "stable") {
                  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
              } else {
                  console.warn("Peer connection is not in stable state, answer ignored temporarily.");
              }
          } catch (err) {
              console.error("Error handling answer: ", err);
          }
      } else if (candidate) {
          try {
              if (peerConnection.signalingState === "stable") {
                  await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
              } else {
                  console.warn("Ignoring ICE candidate because remote description is not set yet.");
              }
          } catch (err) {
              console.error("Error handling ICE candidate: ", err);
          }
      }
  });
  

    socket.on("user-left", (userId) => {
        if (peers.current[userId]) {
            peers.current[userId].close();
            delete peers.current[userId];
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

  const toggleAudio = () => {
    setIsMuted((prev) => !prev);
    localVideo.current.srcObject.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
  };

  const toggleVideo = () => {
    setIsVideoOff((prev) => !prev);
    localVideo.current.srcObject.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
  };

  const endCall = () => {
    socket.emit("user-left", room);
    Object.values(peers.current).forEach((peerConnection) =>
      peerConnection.close()
    );
    socket.disconnect();
  };

  useEffect(() => {
    return () => {
      Object.values(peers.current).forEach((peerConnection) =>
        peerConnection.close()
      );
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <div>
        <button onClick={createRoom}>Create Room</button>
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
        {remoteStreams.map((stream, index) => (
          <video
            key={index}
            autoPlay
            playsInline
            ref={(el) => {
              if (el) el.srcObject = stream;
            }}
          />
        ))}
      </div>

      <div>
        <button onClick={toggleAudio}>{isMuted ? "Unmute Audio" : "Mute Audio"}</button>
        <button onClick={toggleVideo}>{isVideoOff ? "Turn On Video" : "Turn Off Video"}</button>
        <button onClick={endCall}>End Call</button>
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
