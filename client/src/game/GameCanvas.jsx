import { useEffect, useRef, useState } from 'react';
import { TennisGame } from '../scene/TennisGame.js';
import { useKeyboardControls } from './useKeyboardControls.js';

export default function GameCanvas({ socketRef, setup, onExit }) {
  const { mode = 'match', setsToWin = 1, controlMode: initialControl = 'phone' } = setup || {};
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const keysRef = useKeyboardControls();

  const [score, setScore] = useState(null); // { pts, games, sets, server, difficulty, matchWinner }
  const [serve, setServe] = useState({ show: false });
  const [outcome, setOutcome] = useState(null); // { winner, reason }
  const [contact, setContact] = useState(null); // { label, quality, swingSpeed }
  const [choosing, setChoosing] = useState(true);
  const [banner, setBanner] = useState(null); // 'GET READY' | 'GO!'
  const [paused, setPaused] = useState(false);
  const [pitchLine, setPitchLine] = useState(true);
  const [trajectory, setTrajectory] = useState(true);
  const [control, setControl] = useState(initialControl);
  const [locked, setLocked] = useState(false);
  const [rallyOver, setRallyOver] = useState(null); // { shots, best } once the run ends
  const [rally, setRally] = useState({ shots: 0, best: 0 });

  useEffect(() => {
    const game = new TennisGame(containerRef.current, {
      onRallyChange: (shots) => setRally((r) => ({ ...r, shots })),
      onScore: (s) => setScore(s),
      onServePrompt: (p) => setServe(p),
      onBanner: (t) => setBanner(t),
      onPointerLock: (l) => setLocked(l),
      onPoint: (p) => {
        if (p.best != null) setRally({ shots: p.shots, best: p.best });
        if (p.over) { setRallyOver({ shots: p.shots, best: p.best }); return; } // game over takes the screen
        setOutcome({ ...p, at: Date.now() });
        setTimeout(() => setOutcome((cur) => (cur && cur.at ? null : cur)), 1200);
      },
      onContact: (c) => {
        setContact({ ...c, at: Date.now() });
        setTimeout(() => setContact((cur) => (cur && cur.at ? null : cur)), 700);
      },
      difficulty: 'medium',
      mode,
      setsToWin,
      controlMode: initialControl,
    });
    game.setKeysRef(keysRef);
    game.start();
    gameRef.current = game;
    return () => game.dispose();
  }, [keysRef, mode, setsToWin, initialControl]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return undefined;
    const onSwing = (payload) => gameRef.current?.handleSwing(payload);
    const onTilt = (payload) => gameRef.current?.handleTilt(payload);
    const onCalibrate = () => gameRef.current?.handleCalibrate();
    socket.on('swing', onSwing);
    socket.on('tilt', onTilt);
    socket.on('calibrate', onCalibrate);
    return () => {
      socket.off('swing', onSwing);
      socket.off('tilt', onTilt);
      socket.off('calibrate', onCalibrate);
    };
  }, [socketRef]);

  function chooseDifficulty(level) {
    gameRef.current?.setDifficulty(level);
    gameRef.current?.restart();
    setChoosing(false);
  }

  function togglePause() {
    const g = gameRef.current;
    if (!g) return;
    if (paused) { g.resume(); setPaused(false); } else { g.pause(); setPaused(true); }
  }

  function togglePitchLine() {
    const next = !pitchLine;
    setPitchLine(next);
    gameRef.current?.setPitchLine(next);
  }

  function toggleTrajectory() {
    const next = !trajectory;
    setTrajectory(next);
    gameRef.current?.setTrajectory(next);
  }

  function playAgain() {
    setRallyOver(null);
    setOutcome(null);
    setRally((r) => ({ shots: 0, best: r.best })); // the session best carries over
    gameRef.current?.restart();
  }

  function downloadScore() {
    const game = gameRef.current;
    if (!game || !rallyOver) return;
    const url = game.captureScoreCard({ score: rallyOver.shots, best: rallyOver.best });
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `swing-tennis-${rallyOver.shots}-shots.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function toggleControl() {
    const next = control === 'phone' ? 'mouse' : 'phone';
    setControl(next);
    gameRef.current?.setControlMode(next);
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {!choosing && !rallyOver && (
        <button style={styles.pauseBtn} onClick={togglePause} title="Pause">❚❚</button>
      )}

      {score && mode === 'match' && (
        <div style={styles.scoreboard}>
          <ScoreRow name="YOU" serving={score.server === 'player'} s={score} side="player" />
          <ScoreRow name="CPU" serving={score.server === 'ai'} s={score} side="ai" />
          <div style={styles.diffTag}>
            {score.inTiebreak ? 'TIEBREAK · ' : ''}
            {(score.difficulty || '').toUpperCase()}
          </div>
        </div>
      )}

      {mode === 'rally' && (
        <div style={styles.scoreboard}>
          <div style={styles.rallyRow}>
            <span style={styles.rallyLabel}>SHOTS</span>
            <span style={styles.rallyValue}>{rally.shots}</span>
          </div>
          <div style={styles.rallyRow}>
            <span style={styles.rallyLabel}>BEST</span>
            <span style={{ ...styles.rallyValue, color: '#4ecb71' }}>{rally.best}</span>
          </div>
          <div style={styles.diffTag}>{(score?.difficulty || '').toUpperCase()}</div>
        </div>
      )}

      {banner && !paused && <div style={styles.banner}>{banner}</div>}

      <div style={styles.controls}>
        WASD to move · SPACE to serve · {control === 'mouse'
          ? (locked ? 'move the mouse to aim, click to swing · ESC to free the cursor' : 'move the mouse to aim, click to swing')
          : 'swing your phone to hit'}
      </div>

      {control === 'mouse' && !locked && !paused && !choosing && !rallyOver && !score?.matchWinner && (
        <div style={styles.capturePrompt}>CLICK TO CAPTURE THE MOUSE</div>
      )}

      {serve.show && serve.server === 'player' && !choosing && (
        <div style={styles.servePrompt}>
          <div style={styles.serveKey}>SPACE</div>
          <div>{serve.serveNum === 2 ? '2nd serve — toss & serve' : 'to toss & serve'}</div>
        </div>
      )}

      {contact && (
        <div style={{ ...styles.contact, color: contactColor(contact.quality) }}>
          {contact.label}
          <span style={styles.contactMeta}>{Math.round(contact.swingSpeed * 100)}% power</span>
        </div>
      )}

      {outcome && mode === 'match' && (
        <div style={styles.outcomeWrap}>
          <div style={{ ...styles.outcomeWin, color: outcome.winner === 'player' ? '#4ecb71' : '#ff5a5f' }}>
            {outcome.winner === 'player' ? 'YOUR POINT' : 'CPU POINT'}
          </div>
          <div style={styles.outcomeReason}>{reasonText(outcome.reason)}</div>
        </div>
      )}

      {outcome && mode === 'rally' && (
        <div style={styles.outcomeWrap}>
          <div style={{ ...styles.outcomeWin, color: outcome.shots >= outcome.best ? '#4ecb71' : '#ffc93c' }}>
            {outcome.shots} SHOT{outcome.shots === 1 ? '' : 'S'}
          </div>
          <div style={styles.outcomeReason}>
            {outcome.shots >= outcome.best && outcome.shots > 0 ? 'new best · ' : ''}{reasonText(outcome.reason)}
          </div>
        </div>
      )}

      {choosing && (
        <Overlay title="SELECT DIFFICULTY">
          {['easy', 'medium', 'hard'].map((l) => (
            <button key={l} style={styles.bigBtn} onClick={() => chooseDifficulty(l)}>{l.toUpperCase()}</button>
          ))}
        </Overlay>
      )}

      {paused && (
        <Overlay title="PAUSED">
          <button style={styles.bigBtn} onClick={togglePause}>RESUME</button>
          <button
            style={{ ...styles.bigBtn, background: '#a78bfa', color: '#0e1220' }}
            onClick={toggleControl}
          >
            CONTROL: {control === 'phone' ? '📱 PHONE' : '🖱 MOUSE'}
          </button>
          <button
            style={{ ...styles.bigBtn, background: pitchLine ? '#3db7ff' : '#475569', color: pitchLine ? '#0e1220' : '#e2e8f0' }}
            onClick={togglePitchLine}
          >
            BALL MARKER: {pitchLine ? 'ON' : 'OFF'}
          </button>
          <button
            style={{ ...styles.bigBtn, background: trajectory ? '#ffc93c' : '#475569', color: trajectory ? '#0e1220' : '#e2e8f0' }}
            onClick={toggleTrajectory}
          >
            TRAJECTORY: {trajectory ? 'ON' : 'OFF'}
          </button>
          <button style={{ ...styles.bigBtn, background: '#ff5a5f', color: '#fff' }} onClick={onExit}>EXIT</button>
        </Overlay>
      )}

      {score?.matchWinner && !choosing && (
        <Overlay title={score.matchWinner === 'player' ? 'YOU WIN! 🏆' : 'CPU WINS'}>
          <button style={styles.bigBtn} onClick={() => setChoosing(true)}>PLAY AGAIN</button>
        </Overlay>
      )}

      {rallyOver && !choosing && (
        <div style={styles.overlay}>
          <div style={styles.overlayTitle}>GAME OVER</div>
          <div style={styles.finalScoreWrap}>
            <div style={styles.finalScore}>{rallyOver.shots}</div>
            <div style={styles.finalScoreLabel}>
              {rallyOver.shots === 1 ? 'SHOT RETURNED' : 'SHOTS RETURNED'}
            </div>
            <div style={styles.finalBest}>
              {rallyOver.shots >= rallyOver.best && rallyOver.shots > 0
                ? '🏆 NEW BEST'
                : `BEST ${rallyOver.best}`}
            </div>
          </div>
          <div style={styles.overlayRow}>
            <button style={styles.bigBtn} onClick={playAgain}>PLAY AGAIN</button>
            <button style={{ ...styles.bigBtn, background: '#3db7ff' }} onClick={downloadScore}>
              DOWNLOAD YOUR SCORE
            </button>
            <button style={{ ...styles.bigBtn, background: '#ff5a5f', color: '#fff' }} onClick={onExit}>
              EXIT TO HOME
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreRow({ name, serving, s, side }) {
  return (
    <div style={styles.scoreRow}>
      <span style={styles.serveDot}>{serving ? '●' : ''}</span>
      <span style={styles.scoreName}>{name}</span>
      <span style={styles.scoreCell}>{s.sets[side]}</span>
      <span style={styles.scoreCell}>{s.games[side]}</span>
      <span style={{ ...styles.scoreCell, ...styles.scorePts }}>{s.pts[side]}</span>
    </div>
  );
}

function Overlay({ title, children }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.overlayTitle}>{title}</div>
      <div style={styles.overlayRow}>{children}</div>
    </div>
  );
}

function contactColor(q) {
  if (q > 0.8) return '#4ecb71';
  if (q > 0.45) return '#ffc93c';
  if (q > 0.18) return '#ff9f43';
  return '#ff5a5f';
}
function reasonText(r) {
  return { NET: 'into the net', OUT: 'out', MISS: 'no return', WINNER: 'winner', 'DOUBLE FAULT': 'double fault' }[r] || r;
}

const styles = {
  pauseBtn: {
    position: 'absolute', top: 16, left: 16, zIndex: 12,
    width: 40, height: 40, borderRadius: 10, cursor: 'pointer',
    background: 'rgba(15,23,42,0.85)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.25)', fontSize: '0.9rem', lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  scoreboard: {
    position: 'absolute', top: 16, left: 66, zIndex: 10, background: 'rgba(15,23,42,0.8)',
    borderRadius: 10, padding: '10px 14px', color: '#fff', fontFamily: 'monospace',
  },
  banner: {
    position: 'absolute', top: '20%', left: '50%', transform: 'translate(-50%,-50%)',
    fontSize: '2.6rem', fontWeight: 900, color: '#ffc93c', zIndex: 11,
    letterSpacing: '0.08em', textShadow: '0 2px 10px rgba(0,0,0,0.7)', pointerEvents: 'none',
  },
  scoreRow: { display: 'flex', alignItems: 'center', gap: 10, lineHeight: 1.6 },
  rallyRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, lineHeight: 1.5 },
  rallyLabel: { fontWeight: 800, letterSpacing: '0.1em', fontSize: '0.7rem', color: '#94a3b8' },
  rallyValue: { fontWeight: 900, fontSize: '1.4rem', color: '#ffc93c' },
  serveDot: { width: 12, color: '#ffc93c', fontSize: '0.8rem' },
  scoreName: { width: 44, fontWeight: 800, letterSpacing: '0.05em' },
  scoreCell: { width: 26, textAlign: 'center', color: '#94a3b8', fontWeight: 700 },
  scorePts: { color: '#ffc93c', fontWeight: 900, fontSize: '1.1rem' },
  diffTag: { marginTop: 6, fontSize: '0.6rem', color: '#64748b', letterSpacing: '0.1em', textAlign: 'right' },
  controls: {
    position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
    color: '#e2e8f0', background: 'rgba(15,23,42,0.6)', padding: '6px 14px',
    borderRadius: 20, fontSize: '0.8rem', zIndex: 10,
  },
  capturePrompt: {
    position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)',
    color: '#0e1220', background: 'rgba(61,183,255,0.92)', padding: '6px 16px',
    borderRadius: 20, fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.08em',
    zIndex: 10, pointerEvents: 'none',
  },
  servePrompt: {
    position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%,-50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    color: '#fff', fontSize: '1.1rem', fontWeight: 800, zIndex: 10, textAlign: 'center',
    textShadow: '0 2px 8px rgba(0,0,0,0.6)', pointerEvents: 'none',
  },
  serveKey: {
    background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.5)',
    borderRadius: 8, padding: '8px 22px', fontSize: '1.4rem', letterSpacing: '0.15em',
  },
  contact: {
    position: 'absolute', top: '24%', left: '50%', transform: 'translateX(-50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    fontSize: '2rem', fontWeight: 900, zIndex: 10, letterSpacing: '0.05em',
    textShadow: '0 2px 8px rgba(0,0,0,0.6)', pointerEvents: 'none',
  },
  contactMeta: { fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0' },
  outcomeWrap: {
    position: 'absolute', top: '36%', left: '50%', transform: 'translate(-50%,-50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 10,
    pointerEvents: 'none', textShadow: '0 2px 8px rgba(0,0,0,0.6)',
  },
  outcomeWin: { fontSize: '2.6rem', fontWeight: 900, letterSpacing: '0.03em' },
  outcomeReason: { fontSize: '1rem', fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase' },
  overlay: {
    position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(8,12,24,0.82)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
    color: '#fff',
  },
  overlayTitle: { fontSize: '2rem', fontWeight: 900, letterSpacing: '0.05em' },
  finalScoreWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: -8 },
  finalScore: { fontSize: '5.5rem', fontWeight: 900, color: '#ffc93c', lineHeight: 1 },
  finalScoreLabel: { fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.15em', color: '#e2e8f0' },
  finalBest: { fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: '#94a3b8', marginTop: 8 },
  overlayRow: { display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  bigBtn: {
    padding: '14px 28px', fontSize: '1.1rem', fontWeight: 800, borderRadius: 10,
    border: '2px solid rgba(255,255,255,0.25)', background: '#4ecb71', color: '#0e1220',
    cursor: 'pointer', letterSpacing: '0.05em',
  },
};
