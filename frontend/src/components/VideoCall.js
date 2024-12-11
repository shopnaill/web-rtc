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
        const localStream = useRef(null);

        const createPeerConnection = (targetId) => {
            const peerConnection = new RTCPeerConnection();

            // Add local tracks to peer connection
            localStream.current?.getTracks().forEach((track) => peerConnection.addTrack(track, localStream.current));

            // Handle incoming tracks (remote stream)
            peerConnection.ontrack = (event) => {
                setRemoteStreams((prevStreams) => [...prevStreams, event.streams[0]]);
            };

            // ICE candidate handling
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

        // Access local media stream
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: true })
            .then((stream) => {
                localStream.current = stream;
                if (localVideo.current) {
                    localVideo.current.srcObject = stream;
                }
            })
            .catch((err) => console.error("Error accessing media devices:", err));

        // Handle room users
        socket.on("room-users", (users) => {
            users.forEach(async (userId) => {
                const peerConnection = createPeerConnection(userId);
                peers.current[userId] = peerConnection;

                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);

                socket.emit("signal", { room, target: userId, offer });
            });
        });

        // Handle user joining
        socket.on("user-joined", async (userId) => {
            const peerConnection = createPeerConnection(userId);
            peers.current[userId] = peerConnection;

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            socket.emit("signal", { room, target: userId, offer });
        });

        // Handle signaling
        socket.on("signal", async (data) => {
            const { sender, offer, answer, candidate } = data;

            if (!peers.current[sender]) {
                peers.current[sender] = createPeerConnection(sender);
            }

            const peerConnection = peers.current[sender];

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
                {remoteStreams.map((stream, index) => (
                    <video key={index} ref={remoteVideo} srcObject={stream} autoPlay playsInline />
                ))}
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
