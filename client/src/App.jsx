import { useState } from 'react';
import HomeScreen from './home/HomeScreen.jsx';
import PhoneController from './pairing/PhoneController.jsx';
import GameCanvas from './game/GameCanvas.jsx';
import { useSocket } from './pairing/useSocket.js';

const roomFromUrl = new URLSearchParams(window.location.search).get('room');

function DesktopApp() {
  // The room code comes from the server (unique by construction), not from this browser.
  const { socketRef, room, connected, peerConnected, roomError } = useSocket({ role: 'desktop' });
  const [setup, setSetup] = useState(null); // { mode, setsToWin, controlMode }

  if (!setup) {
    return (
      <HomeScreen
        room={room}
        connected={connected}
        peerConnected={peerConnected}
        roomError={roomError}
        onStart={setSetup}
      />
    );
  }

  // Exit returns to the home screen: reload so pairing starts fresh (new room + clean state).
  return <GameCanvas socketRef={socketRef} setup={setup} onExit={() => window.location.reload()} />;
}

export default function App() {
  // Opened via QR code / pairing link -> this device is the phone controller.
  if (roomFromUrl) {
    return <PhoneController room={roomFromUrl} />;
  }
  return <DesktopApp />;
}
