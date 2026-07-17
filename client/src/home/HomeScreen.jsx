import { useState } from 'react';
import PairingScreen from '../pairing/PairingScreen.jsx';

// Home screen: pairing on the left, game setup on the right.
// onStart({ mode, setsToWin, controlMode })
export default function HomeScreen({ room, connected, peerConnected, roomError, onStart }) {
  const [mode, setMode] = useState('match');
  const [setsToWin, setSetsToWin] = useState(1);
  // Default to whatever is actually available: the phone once it's linked, otherwise the mouse.
  const [controlMode, setControlMode] = useState(null);
  const control = controlMode || (peerConnected ? 'phone' : 'mouse');

  return (
    <div style={styles.wrap}>
      <div style={styles.inner}>
        <PairingScreen room={room} connected={connected} peerConnected={peerConnected} roomError={roomError} />

        <div style={styles.right}>
          <h1 style={styles.title}>SWING TENNIS</h1>
          <p style={styles.tagline}>Wimbledon Centre Court · WASD to move · SPACE to serve</p>

          <div style={styles.sectionLabel}>GAME MODE</div>
          <div style={styles.cards}>
            <ModeCard
              active={mode === 'match'}
              icon="🏆"
              name="MATCH"
              blurb="Full tennis match against the CPU. Real scoring, alternating serves, tiebreak at 2-2."
              onClick={() => setMode('match')}
            />
            <ModeCard
              active={mode === 'rally'}
              icon="🎾"
              name="RALLYING"
              blurb="You serve and rally against the CPU. Your score is how many shots you return."
              onClick={() => setMode('rally')}
            />
          </div>

          {mode === 'match' && (
            <>
              <div style={styles.sectionLabel}>SETS TO WIN <span style={styles.hint}>· 3 games per set</span></div>
              <div style={styles.pillRow}>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    style={{ ...styles.pill, ...(setsToWin === n ? styles.pillActive : null) }}
                    onClick={() => setSetsToWin(n)}
                  >
                    {n} {n === 1 ? 'SET' : 'SETS'}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={styles.sectionLabel}>RACKET CONTROL</div>
          <div style={styles.pillRow}>
            <button
              style={{ ...styles.pill, ...(control === 'phone' ? styles.pillActive : null) }}
              onClick={() => setControlMode('phone')}
            >
              📱 PHONE
            </button>
            <button
              style={{ ...styles.pill, ...(control === 'mouse' ? styles.pillActive : null) }}
              onClick={() => setControlMode('mouse')}
            >
              🖱 MOUSE
            </button>
          </div>
          {control === 'phone' && !peerConnected && (
            <div style={styles.warn}>Scan the QR code to link your phone, or switch to mouse.</div>
          )}
          {control === 'mouse' && (
            <div style={styles.hintLine}>Move the mouse to aim the racket · click to swing.</div>
          )}

          <button
            style={{ ...styles.start, ...(control === 'phone' && !peerConnected ? styles.startOff : null) }}
            disabled={control === 'phone' && !peerConnected}
            onClick={() => onStart({ mode, setsToWin, controlMode: control })}
          >
            START
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeCard({ active, icon, name, blurb, onClick }) {
  return (
    <button style={{ ...styles.card, ...(active ? styles.cardActive : null) }} onClick={onClick}>
      <span style={styles.cardIcon}>{icon}</span>
      <span style={styles.cardName}>{name}</span>
      <span style={styles.cardBlurb}>{blurb}</span>
    </button>
  );
}

const styles = {
  wrap: {
    height: '100%', width: '100%', overflowY: 'auto',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(circle at 30% 20%, #16203c 0%, #0b0f1c 60%)',
    color: '#fff', padding: 24,
  },
  inner: { display: 'flex', gap: 36, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  right: { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 },
  title: { fontSize: '2.6rem', fontWeight: 900, letterSpacing: '0.06em', margin: 0 },
  tagline: { color: '#94a3b8', margin: '0 0 8px', fontSize: '0.85rem' },
  sectionLabel: { fontSize: '0.65rem', letterSpacing: '0.2em', color: '#64748b', marginTop: 8, fontWeight: 800 },
  hint: { color: '#475569', letterSpacing: '0.1em' },
  hintLine: { color: '#64748b', fontSize: '0.75rem' },
  warn: { color: '#ffc93c', fontSize: '0.75rem' },
  cards: { display: 'flex', gap: 12 },
  card: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
    padding: '16px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
    background: 'rgba(30,41,59,0.6)', border: '2px solid rgba(255,255,255,0.08)', color: '#e2e8f0',
  },
  cardActive: { border: '2px solid #4ecb71', background: 'rgba(78,203,113,0.12)' },
  cardIcon: { fontSize: '1.5rem' },
  cardName: { fontWeight: 900, letterSpacing: '0.08em', fontSize: '1rem' },
  cardBlurb: { fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 },
  pillRow: { display: 'flex', gap: 10 },
  pill: {
    padding: '10px 18px', borderRadius: 999, cursor: 'pointer', fontWeight: 800,
    fontSize: '0.85rem', letterSpacing: '0.06em',
    background: 'rgba(30,41,59,0.8)', border: '2px solid rgba(255,255,255,0.1)', color: '#94a3b8',
  },
  pillActive: { background: '#3db7ff', color: '#0e1220', border: '2px solid #3db7ff' },
  start: {
    marginTop: 18, padding: '16px 0', borderRadius: 12, cursor: 'pointer',
    fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.12em',
    background: '#4ecb71', color: '#0e1220', border: 'none',
  },
  startOff: { background: '#334155', color: '#64748b', cursor: 'not-allowed' },
};
