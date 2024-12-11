import React, { useState } from "react";
import VideoCall from "./components/VideoCall";

function App() {
  return (
    <div className="App">
      <h1>WebRTC Video Call</h1>
      <VideoCall />
    </div>
  );
}

export default App;
