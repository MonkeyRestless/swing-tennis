import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

const ROOM_ERRORS = {
  busy: 'Server is at capacity — try again in a moment.',
  'not-found': 'That game has closed.',
  full: 'That game already has a phone connected.',
};

// The pairing panel that sits on the left of the home screen.
export default function PairingScreen({ room, connected, peerConnected, roomError }) {
  const canvasRef = useRef(null);
  const pairUrl = room ? `${window.location.origin}${window.location.pathname}?room=${room}` : '';

  useEffect(() => {
    if (canvasRef.current && pairUrl) {
      QRCode.toCanvas(canvasRef.current, pairUrl, { width: 200, margin: 1 });
    }
  }, [pairUrl]);

  const status = roomError ? (ROOM_ERRORS[roomError] || 'Connection problem.')
    : peerConnected ? 'Phone linked'
    : room ? 'Waiting for phone…'
    : 'Connecting to server…';
  const statusColor = roomError ? '#ff5a5f'
    : peerConnected ? '#4ecb71'
    : room ? '#ffc93c'
    : '#64748b';

  return (
    <div style={styles.panel}>
      <div style={styles.heading}>PLAY WITH YOUR PHONE</div>
      {/* Both devices talk to the server independently, so they don't need to share a network. */}
      <p style={styles.sub}>Scan to use your phone as the racket. Any network — WiFi or mobile data.</p>

      <div style={styles.qrSlot}>
        {room
          ? <canvas ref={canvasRef} style={styles.qr} />
          : <div style={styles.qrPlaceholder}>…</div>}
      </div>

      <div style={styles.codeLabel}>ROOM CODE</div>
      <div style={styles.code}>{room || '––––'}</div>
      {room && <div style={styles.link}>{pairUrl}</div>}

      <div style={styles.status}>
        <span style={{ ...styles.dot, background: statusColor }} />
        {status}
      </div>

      <div style={styles.note}>No phone? You can play with the mouse instead.</div>
    </div>
  );
}

const styles = {
  panel: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16, padding: '28px 26px', color: '#fff', textAlign: 'center',
    width: 300, flexShrink: 0,
  },
  heading: { fontSize: '0.95rem', fontWeight: 900, letterSpacing: '0.12em', color: '#e2e8f0' },
  sub: { color: '#94a3b8', fontSize: '0.8rem', margin: 0, maxWidth: 240 },
  qrSlot: { width: 216, height: 216, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qr: { background: '#fff', borderRadius: 8, padding: 8 },
  qrPlaceholder: {
    width: 200, height: 200, borderRadius: 8, color: '#475569', fontSize: '2rem',
    background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  codeLabel: { fontSize: '0.6rem', letterSpacing: '0.2em', color: '#64748b' },
  code: { fontSize: '2.2rem', fontWeight: 900, letterSpacing: '0.12em', color: '#ffc93c', lineHeight: 1 },
  link: { color: '#64748b', fontSize: '0.7rem', wordBreak: 'break-all', maxWidth: 250 },
  status: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, color: '#e2e8f0', fontSize: '0.85rem' },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  note: { color: '#64748b', fontSize: '0.72rem', marginTop: 2 },
};
