import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * Connects to the signaling server and gets a room.
 *
 * Desktop: pass no room — the server allocates a unique code and sends it back. This used to be
 * generated here at random with no uniqueness check, which collides across concurrent players
 * once the game is public.
 * Phone: pass the room code from the pairing link.
 *
 * Returns the live socket ref, the room code, connection/pairing status, and any room error.
 */
export function useSocket({ room: joinRoom, role }) {
  const socketRef = useRef(null);
  const [room, setRoom] = useState(joinRoom || null);
  const [connected, setConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [roomError, setRoomError] = useState(null); // 'not-found' | 'full' | 'busy'

  useEffect(() => {
    if (!role) return undefined;
    if (role === 'phone' && !joinRoom) return undefined;

    // No URL -> same-origin. In dev Vite proxies /socket.io to the signaling server; in
    // production that server serves this page itself. Either way it's a single origin.
    const socket = io({ transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setRoomError(null);
      if (role === 'desktop') socket.emit('create-room');
      else socket.emit('join-room', { room: joinRoom, role });
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('room-created', ({ room: code }) => setRoom(code));
    socket.on('room-error', ({ reason }) => setRoomError(reason || 'error'));

    socket.on('phone-connected', () => setPeerConnected(true));
    socket.on('desktop-found', () => { setPeerConnected(true); setRoomError(null); });
    socket.on('phone-disconnected', () => setPeerConnected(false));
    socket.on('desktop-disconnected', () => setPeerConnected(false));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [joinRoom, role]);

  return { socketRef, room, connected, peerConnected, roomError };
}
