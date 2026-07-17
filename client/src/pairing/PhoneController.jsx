import { useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket.js';

// A swing fires when EITHER a linear-acceleration spike OR a fast rotation (gyroscope)
// crosses threshold — real racket swings produce both, so this catches them reliably.
const ACCEL_THRESHOLD = 13; // m/s^2 of gravity-excluded acceleration
const ROTATION_THRESHOLD = 300; // deg/s of rotation rate
const SWING_COOLDOWN_MS = 300;
const ORIENTATION_EMIT_INTERVAL_MS = 12; // ~80Hz — a high rate is what makes tracking feel smooth
const DEG2RAD = Math.PI / 180;

// Device orientation (beta,alpha,gamma in degrees) -> quaternion, using the same
// Euler(beta, alpha, -gamma, 'YXZ') convention the reference cricket game uses.
// Quaternions interpolate smoothly (slerp) with no gimbal jumps, unlike per-axis Euler.
function orientationToQuat(alphaDeg, betaDeg, gammaDeg) {
  const x = betaDeg * DEG2RAD;
  const y = alphaDeg * DEG2RAD;
  const z = -gammaDeg * DEG2RAD;
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return {
    qx: s1 * c2 * c3 + c1 * s2 * s3,
    qy: c1 * s2 * c3 - s1 * c2 * s3,
    qz: c1 * c2 * s3 - s1 * s2 * c3,
    qw: c1 * c2 * c3 + s1 * s2 * s3,
  };
}

const ROOM_ERRORS = {
  'not-found': 'That game has closed. Reload the page on your computer for a fresh code.',
  full: 'That game already has a phone connected.',
  busy: 'The server is at capacity — try again in a moment.',
};

export default function PhoneController({ room }) {
  const { connected, peerConnected, socketRef, roomError } = useSocket({ room, role: 'phone' });
  const [motionGranted, setMotionGranted] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [lastSwing, setLastSwing] = useState(null);
  const [calibrated, setCalibrated] = useState(false);
  const lastSwingAt = useRef(0);
  const lastOrientEmitAt = useRef(0);
  const latestOrient = useRef({ alpha: 0, beta: 0, gamma: 0 });

  useEffect(() => {
    const needsIOSPermission =
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function';
    setNeedsPermission(needsIOSPermission);
    if (!needsIOSPermission) setMotionGranted(true); // Android / desktop-browser testing
  }, []);

  useEffect(() => {
    if (!motionGranted) return undefined;

    function handleMotion(e) {
      // Linear acceleration (gravity excluded when the device provides it).
      const a = e.acceleration && e.acceleration.x != null ? e.acceleration : null;
      const accelMag = a ? Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2) : 0;

      // Rotation rate from the gyroscope (deg/s).
      const r = e.rotationRate;
      const rotMag = r ? Math.sqrt((r.alpha || 0) ** 2 + (r.beta || 0) ** 2 + (r.gamma || 0) ** 2) : 0;

      const accelScore = accelMag / ACCEL_THRESHOLD;
      const rotScore = rotMag / ROTATION_THRESHOLD;
      const score = Math.max(accelScore, rotScore);

      const now = performance.now();
      if (score >= 1 && now - lastSwingAt.current > SWING_COOLDOWN_MS) {
        lastSwingAt.current = now;
        const strength = Math.min(score / 2.2, 1); // normalize 0..1
        setLastSwing({ strength, at: now });
        socketRef.current?.emit('swing', { strength, timestamp: Date.now() });
        if (navigator.vibrate) navigator.vibrate(30);
      }
    }

    function handleOrientation(e) {
      const alpha = e.alpha ?? 0; // compass heading
      const beta = e.beta ?? 0; // front/back tilt
      const gamma = e.gamma ?? 0; // left/right tilt
      latestOrient.current = { alpha, beta, gamma };
      if (!calibrated) setCalibrated(true);

      const now = performance.now();
      if (now - lastOrientEmitAt.current < ORIENTATION_EMIT_INTERVAL_MS) return;
      lastOrientEmitAt.current = now;

      // The desktop maintains its own calibration baseline, so we send the raw quaternion.
      socketRef.current?.emit('tilt', orientationToQuat(alpha, beta, gamma));
    }

    window.addEventListener('devicemotion', handleMotion);
    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('devicemotion', handleMotion);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [motionGranted, socketRef]);

  async function requestMotionAccess() {
    try {
      const result = await DeviceMotionEvent.requestPermission();
      if (result === 'granted') setMotionGranted(true);
      // iOS also gates orientation behind its own prompt.
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission().catch(() => {});
      }
    } catch (err) {
      console.error('Motion permission request failed', err);
    }
  }

  function calibrate() {
    // Tell the desktop to treat the phone's current hold position as neutral and snap
    // the on-screen racket to its upright pose. Sending the current quaternion first
    // ensures the desktop has a fresh sample to calibrate against.
    const o = latestOrient.current;
    socketRef.current?.emit('tilt', orientationToQuat(o.alpha, o.beta, o.gamma));
    socketRef.current?.emit('calibrate');
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
  }

  return (
    <div style={styles.wrap}>
      <h1 style={styles.title}>SWING TENNIS</h1>

      <div style={styles.status}>
        <span style={{ ...styles.dot, background: roomError ? '#ff5a5f' : connected ? '#4ecb71' : '#ff5a5f' }} />
        {roomError ? 'Not connected' : connected ? (peerConnected ? 'Linked to computer' : 'Waiting for computer…') : 'Connecting…'}
      </div>

      {roomError && <div style={styles.error}>{ROOM_ERRORS[roomError] || 'Could not join that game.'}</div>}

      {!roomError && needsPermission && !motionGranted && (
        <button style={styles.button} onClick={requestMotionAccess}>
          ENABLE MOTION CONTROLS
        </button>
      )}

      {!roomError && motionGranted && (
        <>
          <div style={styles.hint}>
            Hold your phone upright like a racket handle, then press Calibrate.
          </div>

          <button style={styles.calibrateButton} onClick={calibrate}>
            🎾 CALIBRATE
          </button>

          <div style={styles.subHint}>
            After calibrating, tilt to aim and swing to hit.
          </div>

          {lastSwing && (
            <div style={styles.swingFeedback}>
              SWING! power {Math.round(lastSwing.strength * 100)}%
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    height: '100%', width: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16, color: '#fff',
    background: '#0e1220', textAlign: 'center', padding: 24,
  },
  title: { fontSize: '1.8rem', fontWeight: 900, letterSpacing: '0.05em', margin: 0 },
  status: { display: 'flex', alignItems: 'center', gap: 8, color: '#e2e8f0' },
  dot: { width: 10, height: 10, borderRadius: '50%' },
  button: {
    padding: '14px 24px', fontSize: '1.1rem', fontWeight: 800, borderRadius: 8,
    border: 'none', background: '#ff5a5f', color: '#fff', cursor: 'pointer',
  },
  hint: { color: '#94a3b8', maxWidth: 300 },
  error: {
    color: '#ffc9cb', background: 'rgba(255,90,95,0.15)', border: '1px solid rgba(255,90,95,0.4)',
    borderRadius: 10, padding: '12px 16px', maxWidth: 300, fontSize: '0.9rem', lineHeight: 1.4,
  },
  subHint: { color: '#64748b', fontSize: '0.85rem', maxWidth: 280 },
  calibrateButton: {
    padding: '18px 40px', fontSize: '1.4rem', fontWeight: 900, borderRadius: 12,
    border: 'none', background: '#4ecb71', color: '#0e1220', cursor: 'pointer',
    letterSpacing: '0.05em', boxShadow: '0 6px 18px rgba(78,203,113,0.4)',
  },
  swingFeedback: { color: '#ffc93c', fontWeight: 800, fontSize: '1.1rem' },
};
