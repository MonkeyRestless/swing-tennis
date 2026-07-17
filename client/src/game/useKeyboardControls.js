import { useEffect, useRef } from 'react';

const KEY_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

/**
 * Tracks WASD/arrow key state in a mutable ref (avoids re-renders every frame).
 * The Three.js game loop reads keysRef.current directly.
 */
export function useKeyboardControls() {
  const keysRef = useRef({ forward: false, back: false, left: false, right: false });

  useEffect(() => {
    function onKeyDown(e) {
      const action = KEY_MAP[e.code];
      if (action) keysRef.current[action] = true;
    }
    function onKeyUp(e) {
      const action = KEY_MAP[e.code];
      if (action) keysRef.current[action] = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return keysRef;
}
