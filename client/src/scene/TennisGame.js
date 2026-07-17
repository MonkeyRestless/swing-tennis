import * as THREE from 'three';

const COURT = { halfWidth: 5, playerBaseline: 11.5, netZ: 0, opponentBaseline: -11.5 };
const GRAVITY = 9.8;
// A real tennis ball is ~6.7cm across vs a ~26cm racket head — keep roughly that proportion
// (a touch larger than scale so it stays readable at distance).
const BALL_RADIUS = 0.055;
// Bounce: lively surface so the ball sits up into the strike zone. The floor matters most —
// flat/fast shots arrive with little downward speed and would otherwise skid through low.
const BOUNCE_RESTITUTION = 0.88;
const BOUNCE_VARIANCE = 0.06; // ±, so not every bounce is identical
const MIN_BOUNCE_VY = 4.2; // m/s floor -> every bounce pops at least ~0.9m up
const PLAYER_SPEED = 7.6; // court units / s
const PLAYER_RUNBACK = 4.5; // how far behind the baseline the player may move
const EYE_HEIGHT = 1.55;

// --- Net & court (metres; ~1 unit ≈ 1 m) ---
const NET_HEIGHT = 0.95; // the ball must clear this to cross to the other side
const SERVICE_DEPTH = 6.4; // service line distance from the net (serve must land inside this)
const DOUBLES_ALLEY = 1.37; // width of the tramline outside each singles sideline

// --- Precise hit-box (tied to the racket head, which you position by moving + tilting) ---
const CONTACT_RADIUS = 1.45; // ball within this of the reach point = contact; beyond = a whiff
const SWEET_RADIUS = 0.45; // within this of the reach point = cleanly "middled" (quality 1)
const MAX_REACH_HEIGHT = 2.8; // highest ball the racket can reach
const SWING_WINDOW_MS = 320; // how long a received swing stays "live" waiting for the ball
// The hit zone is a stable point on the ground in front of the player (NOT the pitching
// racket head), so low balls stay reachable regardless of where the camera is looking.
const REACH_FWD_X = 0.3; const REACH_FWD_Z = -0.85; // reach point offset from the player
const REACH_TILT_X = 0.75; const REACH_TILT_Z = 0.7; // how far phone tilt nudges the reach point

// --- Shot model ---
// A swing imparts a velocity (speed + launch angle + direction); where the ball ends up
// (in / net / out) then emerges from the physics, so mis-hits genuinely miss.
// Rally shots use the same target-based arc as the serve: aim at a depth in the opponent's
// court with an apex above the net. A fixed speed+angle can't satisfy "clear the net AND
// land in" from every court position and contact height (from the baseline the ball must
// carry 11.5m to the net, so it needs lift no matter how high you take it). Contact quality
// still decides the outcome: it robs lift (into the net) and sprays the aim (wide/long).
const RALLY_SHALLOW_Z = -2.5; // where a gentle shot lands
const RALLY_DEEP_Z = -10.0; // where a full-power shot lands
const RALLY_AIM_X = 3.8; // full left/right aim, inside the sidelines
const RALLY_SPRAY_X = 3.4; // lateral error a mis-hit adds (can push it wide = out)
const SHOT_NET_DIP = 2.0; // lift a mis-hit loses (can find the net)

// --- Serve (struck from up high off the toss) ---
const SERVE_TOSS_VY = 7.2; // toss height
const SERVE_NET_DIP = 2.0; // how much lift poor contact loses (edge/shank serves can net)

// --- Opponent (simple auto-returner) ---
// --- AI opponent difficulty presets ---
// moveSpeed: units/s the AI can run.  reaction: s before it reacts.  pace: 0..1 shot power.
// aimJitter: metres of random aim error.  errorRate: base chance of an unforced error.
// aggression: 0..1 how often it goes for aggressive (risky) targets.  depth: how deep it hits.
const DIFFICULTY = {
  easy: { moveSpeed: 4.6, reaction: 0.34, pace: 0.42, aimJitter: 1.7, errorRate: 0.24, aggression: 0.12, depth: 0.5 },
  medium: { moveSpeed: 6.4, reaction: 0.2, pace: 0.62, aimJitter: 0.95, errorRate: 0.12, aggression: 0.32, depth: 0.72 },
  hard: { moveSpeed: 8.2, reaction: 0.1, pace: 0.82, aimJitter: 0.45, errorRate: 0.05, aggression: 0.52, depth: 0.86 },
};
const AI_HOME_Z = COURT.opponentBaseline + 0.6; // recovery position (just behind the baseline)

// --- Scoring ---
// Short sets: first to 3 games. 2-2 is settled by a standard 7-point (win by 2) tiebreak,
// so a set always ends 3-0, 3-1 or 3-2. Sets needed to win the match is configurable.
const GAMES_PER_SET = 3;
const TIEBREAK_TARGET = 7;
const INTERMISSION_SECONDS = 2.1; // breather between points (outcome -> GET READY -> GO!)

// --- Motion feel ---
// Orientation sensors report rotation, never position, so "moving" the racket through
// space is driven by how the phone is tilted. We read the phone's tilt from its rotated
// "up" axis (gimbal-free, unlike raw Euler angles), which gives two clean, independent
// signals: roll -> horizontal, pitch -> vertical. The racket both visibly tilts with the
// phone (damped rotation) and slides within a range (translation), so it tracks your hand.
const ORIENT_SMOOTH_TAU = 0.04; // seconds; smaller = snappier/more in-sync, larger = smoother
// Device-orientation readings jump near the gimbal (phone held upright), which used to make
// the racket snap. Capping angular speed turns any jump into one smooth sweep.
const RACKET_MAX_RAD_PER_SEC = 12;
const TRAJ_POINTS = 90; // max samples in the predicted flight-path line
// The racket mirrors the phone 1:1 — no damping slerp. Damping had to interpolate from
// identity toward the relative rotation, which always takes the SHORTEST path: at 179° it
// damped to +165°, at 181° (≡ -179°) to -165°, so the racket jumped ~330° across the 180°
// boundary — the "snap". True 1:1 has no such boundary, and is also the right feel for the
// underarm flip. Safe because contact is judged from the ground reach point, not the pose.
// Fraction of the viewport the pointer must travel to sweep the racket end to end while
// captured. Below 1 the sweep is quicker than the screen is wide, which suits fast reaching.
const POINTER_SENS = 0.7;
const TRANS_X_GAIN = 0.8; const TRANS_X_MAX = 0.4; // horizontal reach (roll)
const TRANS_Y_GAIN = 0.95; const TRANS_Y_MAX = 0.42; // vertical reach (pitch)
const AIM_FULL = 0.5; // up-axis x-deflection (~30° roll) that maps to full aim
// Sign of each axis mapping (+1 / -1). Flipped to match how the phone is actually held.
const AXIS_X_SIGN = -1; // roll -> horizontal (fixes left/right swap)
const AXIS_Y_SIGN = 1; // pitch -> vertical (fixes tilt-back lowering the racket)

export class TennisGame {
  constructor(container, {
    onRallyChange, onPoint, onContact, onServePrompt, onScore, onBanner, onPointerLock,
    difficulty, mode, setsToWin, controlMode,
  } = {}) {
    this.container = container;
    this.onRallyChange = onRallyChange || (() => {});
    this.onPoint = onPoint || (() => {}); // ({ winner, reason }) — a point ended
    this.onContact = onContact || (() => {}); // ({ quality, swingSpeed, label })
    this.onServePrompt = onServePrompt || (() => {}); // ({ show, server, serveNum })
    this.onScore = onScore || (() => {}); // (scoreboard)
    this.onBanner = onBanner || (() => {}); // (text|null) — big centred message
    this.onPointerLock = onPointerLock || (() => {}); // (locked) — mouse captured/released

    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'medium';
    this.mode = mode === 'rally' ? 'rally' : 'match'; // 'match' = full scoring, 'rally' = shot count
    this.setsToWin = [1, 2, 3].includes(setsToWin) ? setsToWin : 1;
    this.controlMode = controlMode === 'mouse' ? 'mouse' : 'phone';
    this.paused = false;
    this.showPitchLine = true; // AI bounce marker, on by default
    this.showTrajectory = true; // AI shot flight-path line, on by default
    this._trajPath = [];
    this.bestRally = 0; // rally mode: longest run of shots

    // Mouse control state (an alternative to the phone)
    this._mouse = { x: 0, y: 0, speed: 0 };
    this.pointerLocked = false;

    this.keysRef = { current: { forward: false, back: false, left: false, right: false } };

    // Orientation state (quaternion pipeline)
    this._rawTargetQuat = new THREE.Quaternion(); // latest phone orientation
    this._calibInv = new THREE.Quaternion(); // inverse of the calibrated neutral
    this._needsCalib = true; // capture baseline on first sample
    this._hasOrient = false;
    this._aimX = 0; // horizontal aim from where the phone points, -1..1

    // Reusable temporaries (avoid per-frame allocation)
    this._qRel = new THREE.Quaternion();
    this._targetQuat = new THREE.Quaternion();
    this._swingQuat = new THREE.Quaternion();
    this._identityQuat = new THREE.Quaternion();
    this._targetPos = new THREE.Vector3();
    this._upVec = new THREE.Vector3();
    // Camera look-target tracking (follows the ball, esp. the serve toss).
    this._camDefault = new THREE.Vector3(0, 1.1, COURT.playerBaseline - 16);
    this._camDesired = new THREE.Vector3(0, 1.1, COURT.playerBaseline - 16);
    this._camLook = new THREE.Vector3(0, 1.1, COURT.playerBaseline - 16);

    this.rally = 0;
    this.playerShots = 0; // shots the player struck this point (what rally mode scores)
    this.pendingSwing = null;
    this.ballInReach = false;
    this.disposed = false;

    this._headWorld = new THREE.Vector3(); // racket head world position (visual only)
    this._reachCenter = new THREE.Vector3(0, 0, COURT.playerBaseline - 2.6); // stable ground hit point
    this._ballMiddled = false; // is the ball currently lined up with the sweet spot?

    // Point / rally state machine
    this.phase = 'awaitServe'; // 'awaitServe' | 'aiServePending' | 'serving' | 'rally' | 'matchOver'
    this.shotBy = null; // 'player' | 'ai' — who last struck the live ball
    this.servedThisPoint = false;
    // True only while the serve itself is in flight. Inferring this from `rally === 1` was
    // fragile: any hit that didn't bump the counter (e.g. the AI's net error) left it at 1,
    // so the next rally shot got judged against the short service box and called out.
    this.serveInFlight = false;
    this._prevBallZ = 0; // for net-crossing detection

    // Serve & scoring
    this.server = 'player'; // who serves the current game
    this.serveNum = 1; // 1st or 2nd serve
    this.serveSide = 'deuce'; // 'deuce' (right) or 'ad' (left) — alternates each point
    this.gamePoints = 0; // points played in the current game (drives the serve side)
    this.aiServeTimer = 0;
    this.pts = { player: 0, ai: 0 }; // 0..3 = 0/15/30/40
    this.adv = null; // 'player' | 'ai' | null (advantage after deuce)
    this.games = { player: 0, ai: 0 };
    this.sets = { player: 0, ai: 0 };
    this.matchWinner = null;
    this.inTiebreak = false;
    this.tbPts = { player: 0, ai: 0 };

    // AI opponent
    this.aiPos = new THREE.Vector3(0, 0, AI_HOME_Z);
    this._aiVec = new THREE.Vector3();
    this.aiReactTimer = 0;
    this.aiSwingT = 0;

    this._initScene();
    this._buildCourt();
    this._buildPlayerAnchor();
    this._buildReachRing();
    this._buildRacket();
    this._buildBall();
    this._buildOpponent();
    this._buildStadium();

    this.clock = new THREE.Clock();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);

    // Space serves (toss + swing). Handled here so it works regardless of focus.
    this._onKeyDown = (e) => {
      if (e.code === 'Space') { e.preventDefault(); this._onServeKey(); }
    };
    window.addEventListener('keydown', this._onKeyDown);

    // Mouse control: move to aim the racket, click to swing (power from how fast you moved).
    //
    // Reaching for a wide ball used to run the cursor off the canvas — and out of the window
    // entirely — because aim was read from the pointer's absolute position. So once captured
    // (pointer lock), we integrate relative movement into a virtual pointer that is clamped to
    // the aiming range: the racket still stops at full stretch, but the real cursor no longer
    // exists to escape. Uncaptured, it falls back to absolute position so the game is playable
    // before the player clicks in.
    let lastMt = performance.now();
    this._onMouseMove = (e) => {
      const now = performance.now();
      const dtm = Math.max(now - lastMt, 1) / 1000;
      lastMt = now;

      let nx, ny;
      if (this.pointerLocked) {
        const el = this.renderer.domElement;
        // Scale by viewport size so the sweep feels the same on any display.
        nx = this._mouse.x + (e.movementX || 0) * (2 / (el.clientWidth * POINTER_SENS));
        ny = this._mouse.y + (e.movementY || 0) * (2 / (el.clientHeight * POINTER_SENS));
      } else {
        const r = this.renderer.domElement.getBoundingClientRect();
        nx = ((e.clientX - r.left) / r.width) * 2 - 1;
        ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      }
      nx = THREE.MathUtils.clamp(nx, -1, 1);
      ny = THREE.MathUtils.clamp(ny, -1, 1);

      const sp = Math.hypot(nx - this._mouse.x, ny - this._mouse.y) / dtm;
      this._mouse.speed = this._mouse.speed * 0.6 + sp * 0.4; // smoothed, for swing power
      this._mouse.x = nx;
      this._mouse.y = ny;
    };
    this._onMouseDown = (e) => {
      if (this.controlMode !== 'mouse' || this.paused || e.button !== 0) return;
      // The click that captures the pointer shouldn't also fire a swing.
      if (!this.pointerLocked) { this._capturePointer(); return; }
      const strength = THREE.MathUtils.clamp(0.35 + this._mouse.speed * 0.22, 0.35, 1);
      this.handleSwing({ strength });
    };
    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
      this.onPointerLock(this.pointerLocked);
    };
    window.addEventListener('mousemove', this._onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);

    this._startMatch();

    if (import.meta.env.DEV) window.__game = this; // debug hook, dev-only
  }

  setKeysRef(keysRef) {
    this.keysRef = keysRef;
  }

  handleSwing({ strength = 0.6 } = {}) {
    this.pendingSwing = { strength, expiresAt: performance.now() + SWING_WINDOW_MS };
    this._swingAnimT = 1;
  }

  // Phone sends its orientation as a quaternion (qx,qy,qz,qw) at a high rate.
  handleTilt({ qx, qy, qz, qw } = {}) {
    if (qx === undefined || qw === undefined) return;
    // q and -q are the same rotation. If the incoming sample flips sign (which the sensor
    // does routinely) the interpolation would take the long way round and look like a snap,
    // so keep the sign continuous with the previous sample.
    if (this._hasOrient
      && (qx * this._rawTargetQuat.x + qy * this._rawTargetQuat.y
        + qz * this._rawTargetQuat.z + qw * this._rawTargetQuat.w) < 0) {
      qx = -qx; qy = -qy; qz = -qz; qw = -qw;
    }
    this._rawTargetQuat.set(qx, qy, qz, qw);
    this._hasOrient = true;
    if (this._needsCalib) {
      this._calibInv.copy(this._rawTargetQuat).invert();
      this._needsCalib = false;
    }
  }

  // Phone pressed "Calibrate": treat the current hold as neutral and snap to upright.
  handleCalibrate() {
    if (this._hasOrient) this._calibInv.copy(this._rawTargetQuat).invert();
    this._needsCalib = false;
    this._racketQuat.copy(this._restQuat);
    this._racketPos.copy(this._racketRest.pos);
  }

  start() {
    this._loop();
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.renderer.domElement.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this._releasePointer();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  // ---------- setup ----------

  _initScene() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.scene = new THREE.Scene();
    // Bright summer afternoon — Centre Court with the roof open.
    this.scene.background = new THREE.Color(0x8ec5ea);
    this.scene.fog = new THREE.Fog(0xbcd8ec, 60, 190);

    this.camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 200);
    this.camera.position.set(0, EYE_HEIGHT, COURT.playerBaseline - 2);
    this.camera.quaternion.identity(); // default orientation looks down -Z, toward the net
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Sky bounce + a warm high sun for a day match.
    this.scene.add(new THREE.HemisphereLight(0xcfe6f7, 0x3f6b45, 1.05));
    const sunLight = new THREE.DirectionalLight(0xfff6e0, 1.35);
    sunLight.position.set(-16, 40, -60); // shines from the far (CPU) end, matching the disc
    this.scene.add(sunLight);
    // The sun is behind the far end, so everything facing the player — the racket most of all —
    // would sit in its own shadow. A soft fill from the player's side lifts it back out.
    const fillLight = new THREE.DirectionalLight(0xe8f2ff, 0.75);
    fillLight.position.set(14, 22, 40);
    this.scene.add(fillLight);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    // The sun itself, high in the sky beyond the CPU's end. fog:false so it stays crisp.
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(5, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfffdf0, fog: false }),
    );
    sunDisc.position.set(-20, 58, -140);
    this.scene.add(sunDisc);
    [[9, 0.3], [14, 0.16], [20, 0.08]].forEach(([r, o]) => {
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(r, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: o, fog: false, depthWrite: false }),
      );
      glow.position.copy(sunDisc.position);
      this.scene.add(glow);
    });
  }

  _buildCourt() {
    const hwS = COURT.halfWidth; // singles half-width
    const hwD = COURT.halfWidth + DOUBLES_ALLEY; // doubles half-width
    const BL = COURT.playerBaseline; // baseline (±)
    const SL = SERVICE_DEPTH; // service line (±)
    const netHalfWidth = hwD; // the net spans the full doubles width

    // Grass, with the mown stripes that run baseline-to-baseline at Wimbledon.
    const groundW = hwD * 2 + 9;
    const groundL = BL * 2 + 11;
    const stripes = 18;
    const stripeW = groundW / stripes;
    const light = new THREE.MeshStandardMaterial({ color: 0x4c9a54, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3d8146, roughness: 0.95 });
    const stripeGeo = new THREE.PlaneGeometry(stripeW, groundL);
    for (let i = 0; i < stripes; i++) {
      const s = new THREE.Mesh(stripeGeo, i % 2 ? light : dark);
      s.rotation.x = -Math.PI / 2;
      s.position.set(-groundW / 2 + stripeW * (i + 0.5), 0, 0);
      this.scene.add(s);
    }

    // Standard court lines.
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const seg = [];
    const line = (x1, z1, x2, z2) => seg.push([x1, z1], [x2, z2]);
    line(-hwD, BL, hwD, BL); // near baseline
    line(-hwD, -BL, hwD, -BL); // far baseline
    line(-hwD, -BL, -hwD, BL); // left doubles sideline
    line(hwD, -BL, hwD, BL); // right doubles sideline
    line(-hwS, -BL, -hwS, BL); // left singles sideline
    line(hwS, -BL, hwS, BL); // right singles sideline
    line(-hwS, SL, hwS, SL); // near service line
    line(-hwS, -SL, hwS, -SL); // far service line
    line(0, SL, 0, -SL); // centre service line
    line(0, BL, 0, BL - 0.5); // near centre mark
    line(0, -BL, 0, -BL + 0.5); // far centre mark

    const geo = new THREE.BufferGeometry();
    const verts = [];
    seg.forEach(([x, z]) => verts.push(x, 0.02, z));
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.scene.add(new THREE.LineSegments(geo, lineMat));

    // Net: a real 0.95m-high barrier with posts, plus collision handled in _updateBall.
    const netGeo = new THREE.BoxGeometry(netHalfWidth * 2, NET_HEIGHT, 0.06);
    const netMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, transparent: true, opacity: 0.5 });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, NET_HEIGHT / 2, COURT.netZ);
    this.scene.add(net);

    const band = new THREE.Mesh(
      new THREE.BoxGeometry(netHalfWidth * 2, 0.07, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    band.position.set(0, NET_HEIGHT, COURT.netZ);
    this.scene.add(band);

    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, NET_HEIGHT + 0.12, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    [-1, 1].forEach((s) => {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(s * (netHalfWidth + 0.1), (NET_HEIGHT + 0.12) / 2, COURT.netZ);
      this.scene.add(post);
    });
  }

  // Centre-Court-style bowl: a dark green surround wall, steeply raked stands packed with
  // crowd on all four sides, and the white roof truss ring open to the sky.
  _buildStadium() {
    const IN_X = 12.5; // inner edge of the bowl (clear of the run-off the player can use)
    const IN_Z = 19.5;
    const ROWS = 16;
    const RUN = 0.78; // how far each row steps back
    const RISE = 0.62; // and up
    const WALL_H = 1.6; // green surround wall at the foot of the stands

    const stadium = new THREE.Group();
    const green = new THREE.MeshStandardMaterial({ color: 0x0f3b26, roughness: 0.9 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x11492c, roughness: 0.9 });

    // Surround wall (the dark green boards ringing the court).
    const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
    [[0, -IN_Z, IN_X * 2, 0.4], [0, IN_Z, IN_X * 2, 0.4],
      [-IN_X, 0, 0.4, IN_Z * 2], [IN_X, 0, 0.4, IN_Z * 2]].forEach(([x, z, sx, sz]) => {
      const w = new THREE.Mesh(wallGeo, green);
      w.position.set(x, WALL_H / 2, z);
      w.scale.set(sx, 1, sz);
      stadium.add(w);
    });

    // Raked seating: each row is a step further out and higher, on all four sides.
    const rowGeo = new THREE.BoxGeometry(1, 1, 1);
    const crowdGeo = new THREE.BoxGeometry(0.26, 0.42, 0.26);
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const perRowSide = 46; // spectators along a long side row
    const perRowEnd = 30;
    const totalCrowd = ROWS * (perRowSide * 2 + perRowEnd * 2);
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, totalCrowd);
    crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    let ci = 0;

    const placeCrowd = (x, y, z) => {
      if (ci >= totalCrowd) return;
      m.makeTranslation(x, y, z);
      crowd.setMatrixAt(ci, m);
      // mostly muted clothing with occasional bright specks, like a packed stand
      const h = Math.random();
      const bright = Math.random() < 0.18;
      col.setHSL(h, bright ? 0.65 : 0.18, bright ? 0.55 : 0.35 + Math.random() * 0.4);
      crowd.setColorAt(ci, col);
      ci++;
    };

    for (let r = 0; r < ROWS; r++) {
      const out = r * RUN;
      const y = WALL_H + r * RISE;
      const x = IN_X + out;
      const z = IN_Z + out;

      // long sides (left/right of the court)
      [-1, 1].forEach((sx) => {
        const step = new THREE.Mesh(rowGeo, seatMat);
        step.position.set(sx * x, y - RISE / 2, 0);
        step.scale.set(RUN, RISE, z * 2);
        stadium.add(step);
        for (let i = 0; i < perRowSide; i++) {
          const pz = -z + (i + 0.5) * (z * 2 / perRowSide);
          placeCrowd(sx * x, y + 0.21, pz);
        }
      });

      // ends (behind the baselines)
      [-1, 1].forEach((sz) => {
        const step = new THREE.Mesh(rowGeo, seatMat);
        step.position.set(0, y - RISE / 2, sz * z);
        step.scale.set(x * 2, RISE, RUN);
        stadium.add(step);
        for (let i = 0; i < perRowEnd; i++) {
          const px = -x + (i + 0.5) * (x * 2 / perRowEnd);
          placeCrowd(px, y + 0.21, sz * z);
        }
      });
    }
    crowd.count = ci;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    stadium.add(crowd);

    // Roof: the white truss ring around the rim, open to the sky in the middle.
    const roofY = WALL_H + ROWS * RISE + 2.6;
    const outX = IN_X + ROWS * RUN;
    const outZ = IN_Z + ROWS * RUN;
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.55, metalness: 0.1 });
    const trussGeo = new THREE.BoxGeometry(1, 1, 1);
    const addBeam = (x, y, z, sx, sy, sz) => {
      const b = new THREE.Mesh(trussGeo, white);
      b.position.set(x, y, z); b.scale.set(sx, sy, sz);
      stadium.add(b);
    };
    // fascia band capping the stands
    addBeam(0, roofY - 1.4, -outZ, outX * 2, 1.5, 0.5);
    addBeam(0, roofY - 1.4, outZ, outX * 2, 1.5, 0.5);
    addBeam(-outX, roofY - 1.4, 0, 0.5, 1.5, outZ * 2);
    addBeam(outX, roofY - 1.4, 0, 0.5, 1.5, outZ * 2);
    // inner rim of the roof (the opening)
    const rimX = outX - 4.5, rimZ = outZ - 4.5;
    addBeam(0, roofY, -rimZ, rimX * 2, 0.45, 0.45);
    addBeam(0, roofY, rimZ, rimX * 2, 0.45, 0.45);
    addBeam(-rimX, roofY, 0, 0.45, 0.45, rimZ * 2);
    addBeam(rimX, roofY, 0, 0.45, 0.45, rimZ * 2);
    // ribs spanning outer fascia -> inner rim, like the Centre Court trusses
    for (let i = 0; i <= 12; i++) {
      const t = -rimZ + (i / 12) * rimZ * 2;
      addBeam(-(outX + rimX) / 2, roofY, t, outX - rimX, 0.3, 0.3);
      addBeam((outX + rimX) / 2, roofY, t, outX - rimX, 0.3, 0.3);
    }
    for (let i = 0; i <= 8; i++) {
      const t = -rimX + (i / 8) * rimX * 2;
      addBeam(t, roofY, -(outZ + rimZ) / 2, 0.3, 0.3, outZ - rimZ);
      addBeam(t, roofY, (outZ + rimZ) / 2, 0.3, 0.3, outZ - rimZ);
    }

    this.scene.add(stadium);
    this.stadium = stadium;
    this.crowdCount = ci;
  }

  _buildOpponent() {
    const group = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: 0xff5a5f });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48c });
    const shorts = new THREE.MeshStandardMaterial({ color: 0x1f2937 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 4, 10), shirt);
    torso.position.y = 1.18;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), skin);
    head.position.y = 1.66;
    group.add(head);

    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.16, 4, 10), shorts);
    hips.position.y = 0.84;
    group.add(hips);

    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.09, 0.6, 4, 8);
    [-0.12, 0.12].forEach((x) => {
      const leg = new THREE.Mesh(legGeo, skin);
      leg.position.set(x, 0.42, 0);
      group.add(leg);
    });

    // Arms — the right one holds the racket
    const armGeo = new THREE.CapsuleGeometry(0.07, 0.46, 4, 8);
    const armL = new THREE.Mesh(armGeo, skin);
    armL.position.set(-0.33, 1.2, 0);
    armL.rotation.z = 0.32;
    group.add(armL);

    const armR = new THREE.Mesh(armGeo, skin);
    armR.position.set(0.33, 1.2, 0);
    armR.rotation.z = -0.32;
    group.add(armR);

    // Opponent's racket
    const racket = new THREE.Group();
    racket.position.set(0.48, 1.0, 0.05);
    racket.rotation.z = -0.5;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.26, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a }));
    handle.position.y = -0.13;
    racket.add(handle);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0x1f1f26 }));
    rim.position.y = 0.13;
    racket.add(rim);
    const strings = new THREE.Mesh(new THREE.CircleGeometry(0.135, 20),
      new THREE.MeshStandardMaterial({ color: 0xf3f0e6, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
    strings.position.y = 0.13;
    racket.add(strings);
    group.add(racket);
    this.opponentRacket = racket;

    group.position.set(0, 0, COURT.opponentBaseline + 0.5);
    this.scene.add(group);
    this.opponent = group;
  }

  _buildPlayerAnchor() {
    this.player = new THREE.Object3D();
    this.player.position.set(0, 0, COURT.playerBaseline - 2);
    this.scene.add(this.player);
  }

  _buildReachRing() {
    // The contact zone: follows the racket head, so it shows exactly where you can reach.
    const geo = new THREE.RingGeometry(CONTACT_RADIUS - 0.1, CONTACT_RADIUS, 48);
    this._reachRingMat = new THREE.MeshBasicMaterial({
      color: 0x3db7ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    });
    this.reachRing = new THREE.Mesh(geo, this._reachRingMat);
    this.reachRing.rotation.x = -Math.PI / 2;
    this.reachRing.position.y = 0.04;
    this.scene.add(this.reachRing);
  }

  _buildRacket() {
    const group = new THREE.Group();
    // Neutral "ready" pose: racket held upright, lower-right of view.
    group.position.set(0.32, -0.5, -0.8);
    group.rotation.set(-0.08, 0.1, 0.03);
    group.scale.setScalar(0.82);

    const handleMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 10), handleMat);
    handle.position.set(0, -0.17, 0);
    group.add(handle);

    const throatMat = new THREE.MeshStandardMaterial({ color: 0x1f1f26 });
    const throatL = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), throatMat);
    throatL.position.set(-0.06, 0.06, 0);
    throatL.rotation.z = 0.35;
    group.add(throatL);
    const throatR = throatL.clone();
    throatR.position.x = 0.06;
    throatR.rotation.z = -0.35;
    group.add(throatR);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.28, 0);
    group.add(headGroup);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.17, 0.02, 10, 24),
      new THREE.MeshStandardMaterial({ color: 0x1f1f26 }),
    );
    headGroup.add(rim);

    const strings = new THREE.Mesh(
      new THREE.CircleGeometry(0.155, 24),
      new THREE.MeshStandardMaterial({ color: 0xf3f0e6, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    headGroup.add(strings);

    this.racketGroup = group;
    this.racketHead = headGroup;

    this._racketRest = { pos: group.position.clone(), rot: group.rotation.clone() };
    this._restQuat = new THREE.Quaternion().setFromEuler(group.rotation.clone());
    this._racketQuat = this._restQuat.clone(); // current (smoothed) orientation
    this._racketPos = group.position.clone(); // current (smoothed) position
    this._swingAnimT = 0;
    this._hitFlashT = 0;

    this.camera.add(group);
  }

  _buildBall() {
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xd7ff3c });
    this.ball = new THREE.Mesh(geo, mat);
    this.scene.add(this.ball);
    this.ballVel = new THREE.Vector3();
    this.ballInPlay = false;

    const shadowGeo = new THREE.CircleGeometry(BALL_RADIUS * 1.7, 20);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
    this.ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.03;
    this.ballShadow.visible = false;
    this.scene.add(this.ballShadow);

    // Sweet-spot marker: a ground ring under the racket head. Line the ball's shadow up
    // inside it for a cleanly "middled" hit. It follows your tilt (racket movement).
    const sweetGeo = new THREE.RingGeometry(SWEET_RADIUS - 0.08, SWEET_RADIUS, 40);
    this._sweetMat = new THREE.MeshBasicMaterial({
      color: 0xffc93c, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    });
    this.sweetSpot = new THREE.Mesh(sweetGeo, this._sweetMat);
    this.sweetSpot.rotation.x = -Math.PI / 2;
    this.sweetSpot.position.y = 0.05;
    this.scene.add(this.sweetSpot);

    // "Pitch line": where the AI's incoming ball is predicted to bounce, so the player can
    // read the shot early and move there. Toggleable from the pause menu.
    const pitch = new THREE.Group();
    const pitchRing = new THREE.Mesh(
      new THREE.RingGeometry(0.19, 0.26, 24),
      new THREE.MeshBasicMaterial({ color: 0xff5a5f, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    pitchRing.rotation.x = -Math.PI / 2;
    pitch.add(pitchRing);
    // a short cross-hair so it reads as a target
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff5a5f, transparent: true, opacity: 0.9 });
    const barA = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.03), barMat);
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.34), barMat);
    pitch.add(barA); pitch.add(barB);
    pitch.position.y = 0.06;
    pitch.visible = false;
    this.scene.add(pitch);
    this.pitchMarker = pitch;

    // Trajectory line: the predicted flight path of the AI's shot up to where it lands.
    const trajGeo = new THREE.BufferGeometry();
    trajGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAJ_POINTS * 3), 3));
    const trajMat = new THREE.LineBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.75 });
    this.trajectoryLine = new THREE.Line(trajGeo, trajMat);
    this.trajectoryLine.frustumCulled = false;
    this.trajectoryLine.visible = false;
    this.scene.add(this.trajectoryLine);
    this._trajPositions = trajGeo.attributes.position;
  }

  // ---------- gameplay: match / point / serve state machine ----------

  setDifficulty(level) {
    if (DIFFICULTY[level]) this.difficulty = level;
  }

  restart() {
    this._startMatch();
  }

  // Capture the mouse so aiming can't run the cursor off the window. Browsers only grant this
  // from a user gesture, and Esc always releases it — that's the browser's call, not ours.
  _capturePointer() {
    const el = this.renderer.domElement;
    if (!el.requestPointerLock) return; // unsupported -> absolute-position fallback still works
    try {
      const r = el.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch { /* denied (e.g. not a user gesture) -> stay on the fallback */ }
  }

  _releasePointer() {
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
  }

  // Pausing hands the cursor back so the menu is clickable.
  pause() { this.paused = true; this._releasePointer(); }
  resume() { this.paused = false; this.clock.getDelta(); /* drop the paused gap */ }
  setPitchLine(on) {
    this.showPitchLine = !!on;
    if (!on) this.pitchMarker.visible = false;
  }
  setTrajectory(on) {
    this.showTrajectory = !!on;
    if (!on) this.trajectoryLine.visible = false;
  }
  setControlMode(m) {
    this.controlMode = m === 'mouse' ? 'mouse' : 'phone';
    if (this.controlMode === 'phone') this._releasePointer(); // phone aiming needs no cursor
  }
  setMode(m) {
    this.mode = m === 'rally' ? 'rally' : 'match';
  }

  // A shareable PNG of the court with the player's score drawn over it.
  //
  // The scoreboard is HTML sitting above the canvas, so it isn't in the WebGL frame and can't
  // be read back with it — the card draws its own panel instead. The render call matters: the
  // drawing buffer is cleared after each frame (preserveDrawingBuffer is off, as it should be
  // for performance), so the pixels must be read in the same tick as a fresh draw.
  captureScoreCard({ score = 0, best = 0 } = {}) {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0);

    const s = out.width / 1280; // scale everything off a 1280-wide reference
    const panelW = 620 * s;
    const panelH = 300 * s;
    const px = (out.width - panelW) / 2;
    const py = (out.height - panelH) / 2;

    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    ctx.fillStyle = 'rgba(8,12,24,0.85)';
    roundRect(px, py, panelW, panelH, 18 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2 * s;
    ctx.stroke();

    const centre = out.width / 2;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#94a3b8';
    ctx.font = `800 ${16 * s}px system-ui, sans-serif`;
    ctx.fillText('SWING TENNIS · RALLYING', centre, py + 42 * s);

    ctx.fillStyle = '#ffc93c';
    ctx.font = `900 ${120 * s}px system-ui, sans-serif`;
    ctx.fillText(String(score), centre, py + 168 * s);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = `800 ${20 * s}px system-ui, sans-serif`;
    ctx.fillText(score === 1 ? 'SHOT RETURNED' : 'SHOTS RETURNED', centre, py + 204 * s);

    ctx.fillStyle = '#64748b';
    ctx.font = `700 ${15 * s}px system-ui, sans-serif`;
    const stamp = new Date().toLocaleDateString();
    ctx.fillText(`BEST ${best}  ·  ${this.difficulty.toUpperCase()}  ·  ${stamp}`, centre, py + 252 * s);

    return out.toDataURL('image/png');
  }
  setSetsToWin(n) {
    if ([1, 2, 3].includes(n)) this.setsToWin = n;
  }

  _ai() {
    return DIFFICULTY[this.difficulty];
  }

  _startMatch() {
    this.pts = { player: 0, ai: 0 };
    this.adv = null;
    this.games = { player: 0, ai: 0 };
    this.sets = { player: 0, ai: 0 };
    this.tbPts = { player: 0, ai: 0 };
    this.inTiebreak = false;
    this.matchWinner = null;
    this.server = 'player'; // rally mode: the player always serves
    this.gamePoints = 0;
    this.lastScore = 0; // rally mode: shots returned in the run just played
    // _beginServe clears these too, but not until the opening intermission ends — reset here
    // so a restart reads as 0 immediately rather than showing the previous run's tally.
    this.rally = 0;
    this.playerShots = 0;
    this.onRallyChange(0);
    this._emitScore();
    this._intermission(); // opening READY / GO
  }

  _startPoint() {
    this.serveNum = 1;
    this._beginServe();
  }

  // Re-serve the same point (a let / missed toss) without changing the score or serve number.
  _beginServe() {
    this.ballInPlay = false;
    this.ballInReach = false;
    this.ballShadow.visible = false;
    this.pendingSwing = null;
    this.shotBy = null;
    this.servedThisPoint = false;
    this.serveInFlight = false;
    this.rally = 0;
    this.playerShots = 0;
    this.onRallyChange(0);
    this.aiHitPending = false;
    this.ball.visible = false; // hidden until the ball is put in play by a serve

    // Serve side alternates each point in the game (deuce court on even points).
    this.serveSide = this.gamePoints % 2 === 0 ? 'deuce' : 'ad';

    if (this.server === 'player') {
      // Player stands behind the baseline on the serve side; AI stands to receive.
      const sx = this.serveSide === 'deuce' ? 2.2 : -2.2;
      this.player.position.set(sx, 0, COURT.playerBaseline + 0.8);
      this.aiPos.set(this._receiverBoxXSign() * 2.2, 0, AI_HOME_Z + 1.5);
      this.phase = 'awaitServe';
      this.onServePrompt({ show: true, server: 'player', serveNum: this.serveNum });
    } else {
      // AI serves from its side; the player receives.
      this.aiPos.set(this._serverXSign() * 2.0, 0, AI_HOME_Z);
      this.phase = 'aiServePending';
      this.aiServeTimer = 0.9;
      this.onServePrompt({ show: false, server: 'ai', serveNum: this.serveNum });
    }
    this.opponent.position.set(this.aiPos.x, 0, this.aiPos.z);
  }

  // Space pressed: toss the ball up in front of the player, ready to be struck.
  _onServeKey() {
    if (this.phase !== 'awaitServe' || this.server !== 'player') return;
    this.phase = 'serving';
    this.onServePrompt({ show: false });
    this.ball.position.set(this.player.position.x + 0.25, 1.1, this.player.position.z - 0.5);
    this.ballVel.set(0, SERVE_TOSS_VY, 0);
    this.ballInPlay = true;
    this.ball.visible = true;
    this.hasBounced = false;
    this.ballShadow.visible = true;
    this._prevBallZ = this.ball.position.z;
  }

  // The AI serves from its side, cross-court into the player's diagonal service box.
  _aiServe() {
    const cfg = this._ai();
    const serverSign = this._serverXSign(); // AI's side of centre
    const boxSign = this._receiverBoxXSign(); // player's diagonal box
    const bx = THREE.MathUtils.clamp(serverSign * 1.6, -3, 3);
    this.ball.position.set(bx, 2.4, COURT.opponentBaseline + 0.4);
    this.opponent.position.set(bx, 0, COURT.opponentBaseline + 0.5);
    this.aiSwingT = 0.5;

    const faultChance = this.serveNum === 1 ? cfg.errorRate * 1.5 : cfg.errorRate * 0.6;
    const missWide = Math.random() < faultChance;
    let targetX = boxSign * THREE.MathUtils.randFloat(1.4, COURT.halfWidth - 0.8)
      + THREE.MathUtils.randFloatSpread(2) * cfg.aimJitter;
    if (missWide) targetX = boxSign * (COURT.halfWidth + THREE.MathUtils.randFloat(0.8, 2.0));
    const targetZ = THREE.MathUtils.lerp(2.0, SERVICE_DEPTH - 0.8, cfg.pace);

    this._serveArcTo(targetX, targetZ);
    this.shotBy = 'ai';
    this.servedThisPoint = true;
    this.serveInFlight = true;
    this.phase = 'rally';
    this.hasBounced = false;
    this.ballInPlay = true;
    this.ball.visible = true;
    this.ballShadow.visible = true;
    this._prevBallZ = this.ball.position.z;
    this.rally = 1;
    this.onRallyChange(1);
  }

  // Horizontal distance from the ball to the stable ground reach point.
  _ballDistToSweetSpot() {
    const dx = this.ball.position.x - this._reachCenter.x;
    const dz = this.ball.position.z - this._reachCenter.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Precise hit-box: contact only if the ball is within CONTACT_RADIUS of the racket head.
  _isBallInReach() {
    if (!this.ballInPlay) return false;
    if (this.ball.position.y > MAX_REACH_HEIGHT) return false;
    // During a serve toss the ball is above/beside the player and not travelling toward us,
    // so we skip the "coming toward the player" test that a rally shot needs.
    if (this.phase === 'rally' && this.ballVel.z <= 0) return false;
    return this._ballDistToSweetSpot() < CONTACT_RADIUS;
  }

  _quality() {
    const d = this._ballDistToSweetSpot();
    return THREE.MathUtils.clamp(1 - (d - SWEET_RADIUS) / (CONTACT_RADIUS - SWEET_RADIUS), 0, 1);
  }

  // A swing imparts a velocity; the landing spot (in / net / out) emerges from physics.
  _strikeShot({ strength }, isServe) {
    const swingSpeed = THREE.MathUtils.clamp(strength, 0, 1);
    const quality = this._quality();

    if (isServe) {
      this._serveVelocity(swingSpeed, quality);
    } else {
      // Depth scales with swing power; aim comes from the phone, mis-hits spray it wide.
      const targetZ = THREE.MathUtils.lerp(RALLY_SHALLOW_Z, RALLY_DEEP_Z, swingSpeed);
      const targetX = this._aimX * RALLY_AIM_X
        + (1 - quality) * THREE.MathUtils.randFloatSpread(2) * RALLY_SPRAY_X;
      this._arcTo(targetX, targetZ, 0.5); // clean arc, clears the net
      this.ballVel.y -= (1 - quality) * SHOT_NET_DIP; // poor contact loses lift -> can net
    }
    this.hasBounced = false;
    this.shotBy = 'player';
    this.phase = 'rally';
    if (isServe) this.servedThisPoint = true;
    this.serveInFlight = !!isServe; // a rally shot clears it, so it's judged on the full court

    const label = quality > 0.8 ? 'MIDDLED' : quality > 0.45 ? 'SOLID' : quality > 0.18 ? 'EDGE' : 'SHANK';
    this._hitFlashT = 0.6 + 0.4 * quality;
    this._swingAnimT = 0.6 + 0.4 * swingSpeed;
    this.lastContact = { quality, swingSpeed, label };
    this.rally += 1;
    this.playerShots += 1; // rally mode scores the player's own shots, serve included
    this.onRallyChange(this.mode === 'rally' ? this.playerShots : this.rally);
    this.onContact(this.lastContact);
  }

  // An arc from the ball to a target on the court, apexing above the net so it clears from
  // anywhere. Used by serves and rally shots alike; callers degrade it for poor contact.
  _arcTo(targetX, targetZ, apexMargin = 0.5) {
    const b = this.ball.position;
    // Far from the net the ball must climb to get over it, so require a net-clearing apex.
    const apex = Math.max(b.y + apexMargin, NET_HEIGHT + 1.2);
    const vy = Math.sqrt(2 * GRAVITY * Math.max(apex - b.y, 0.02));
    const flightTime = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * b.y)) / GRAVITY;
    this.ballVel.set((targetX - b.x) / flightTime, vy, (targetZ - b.z) / flightTime);
  }
  _serveArcTo(targetX, targetZ, apexMargin = 0.5) {
    this._arcTo(targetX, targetZ, apexMargin);
  }

  // Which side of centre the server stands on (world +x). The AI faces the other way.
  _serverXSign() {
    if (this.server === 'player') return this.serveSide === 'deuce' ? 1 : -1;
    return this.serveSide === 'deuce' ? -1 : 1;
  }
  // The serve must land cross-court, in the service box on the opposite x-half.
  _receiverBoxXSign() {
    return -this._serverXSign();
  }

  _serveVelocity(swingSpeed, quality) {
    const boxSign = this._receiverBoxXSign();
    // Aim into the correct diagonal service box; poor contact sprays it wide.
    let targetX = boxSign * THREE.MathUtils.randFloat(1.4, COURT.halfWidth - 0.7);
    targetX += (1 - quality) * THREE.MathUtils.randFloatSpread(2) * 3.2;
    const targetZ = THREE.MathUtils.lerp(-2.4, -(SERVICE_DEPTH - 1.0), swingSpeed);
    this._serveArcTo(targetX, targetZ, 0.5); // clean arc (clears the net)
    // Poor contact robs the serve of lift, so an edge/shank can dip into the net.
    this.ballVel.y -= (1 - quality) * SERVE_NET_DIP;
  }

  // In-bounds tests. side 'ai' = opponent's half (z<0); 'player' = player's half (z>0).
  _inCourt(x, z, side) {
    if (Math.abs(x) > COURT.halfWidth) return false;
    return side === 'ai'
      ? z <= 0 && z >= COURT.opponentBaseline
      : z >= 0 && z <= COURT.playerBaseline;
  }
  // xSign (optional): the ball must land in the +x or -x service box (diagonal serve rule).
  _inServiceBox(x, z, side, xSign) {
    if (Math.abs(x) > COURT.halfWidth) return false;
    if (xSign > 0 && x < -0.1) return false;
    if (xSign < 0 && x > 0.1) return false;
    return side === 'ai' ? z <= 0 && z >= -SERVICE_DEPTH : z >= 0 && z <= SERVICE_DEPTH;
  }

  // ---------- scoring ----------

  _endPoint(winner, reason) {
    if (this.mode === 'rally') {
      // Rally mode: no tennis scoring — the run is however many shots the player landed.
      // A shot that ended the run (netted, out, or a fault) isn't one they got back.
      const errored = winner === 'ai' && (reason === 'NET' || reason === 'OUT');
      const shots = reason === 'DOUBLE FAULT'
        ? 0 // never got the ball in play
        : Math.max(0, errored ? this.playerShots - 1 : this.playerShots);
      this.lastScore = shots;
      this.bestRally = Math.max(this.bestRally, shots);
      // The CPU never misses in rally mode, so the run can only end on the player's error:
      // that's game over, not another point.
      this.phase = 'matchOver';
      this.ballInPlay = false;
      this._releasePointer(); // the game-over buttons need a cursor
      this.onBanner(null);
      this.onServePrompt({ show: false });
      this.onPoint({ winner, reason, shots, best: this.bestRally, over: true });
      this._emitScore();
      return;
    }
    this.onPoint({ winner, reason });
    this._scorePoint(winner);
    if (this.matchWinner) {
      this.phase = 'matchOver';
      this._releasePointer(); // the end-of-match buttons need a cursor
      this._emitScore();
      this.onBanner(null);
      return;
    }
    this._emitScore();
    this._intermission();
  }

  // A breather between points: the outcome shows, then GET READY -> GO! -> next serve.
  _intermission() {
    this.phase = 'intermission';
    this.breakTimer = INTERMISSION_SECONDS;
    this._readyShown = false;
    this._goShown = false;
    this.ballInPlay = false;
    this.ball.visible = false;
    this.ballShadow.visible = false;
    this.pitchMarker.visible = false;
    this.trajectoryLine.visible = false;
    this.pendingSwing = null;
  }

  _updateIntermission(dt) {
    this.breakTimer -= dt;
    if (!this._readyShown && this.breakTimer <= INTERMISSION_SECONDS - 0.9) {
      this.onBanner('GET READY'); this._readyShown = true;
    }
    if (!this._goShown && this.breakTimer <= 0.35) {
      this.onBanner('GO!'); this._goShown = true;
    }
    if (this.breakTimer <= 0) {
      this.onBanner(null);
      this._startPoint();
    }
  }

  _serveFault() {
    // First serve fault -> a second serve; second fault -> double fault (server loses point).
    if (this.serveNum === 1) {
      this.serveNum = 2;
      this._beginServe();
    } else {
      this._endPoint(this.server === 'player' ? 'ai' : 'player', 'DOUBLE FAULT');
    }
  }

  _scorePoint(w) {
    this.gamePoints += 1; // drives which side (deuce/ad) the next serve comes from
    const o = w === 'player' ? 'ai' : 'player';

    if (this.inTiebreak) {
      this.tbPts[w] += 1;
      // In a tiebreak the serve changes after the 1st point, then every 2 points.
      if ((this.tbPts.player + this.tbPts.ai) % 2 === 1) {
        this.server = this.server === 'player' ? 'ai' : 'player';
      }
      if (this.tbPts[w] >= TIEBREAK_TARGET && this.tbPts[w] - this.tbPts[o] >= 2) this._winGame(w);
      return;
    }

    if (this.adv) {
      if (this.adv === w) return this._winGame(w);
      this.adv = null; // advantage lost -> back to deuce
      return;
    }
    if (this.pts[w] === 3 && this.pts[o] === 3) { this.adv = w; return; } // deuce -> advantage
    if (this.pts[w] === 3) return this._winGame(w); // 40 vs <40 -> game
    this.pts[w] += 1;
  }

  _winGame(w) {
    const wasTiebreak = this.inTiebreak;
    this.pts = { player: 0, ai: 0 };
    this.tbPts = { player: 0, ai: 0 };
    this.adv = null;
    this.inTiebreak = false;
    this.gamePoints = 0; // new game -> serve side resets to deuce
    this.games[w] += 1;

    if (this.games[w] >= GAMES_PER_SET) {
      // Set won (3-0, 3-1, or 3-2 via the tiebreak).
      this.sets[w] += 1;
      this.games = { player: 0, ai: 0 };
      if (this.sets[w] >= this.setsToWin) this.matchWinner = w;
    } else if (this.games.player === GAMES_PER_SET - 1 && this.games.ai === GAMES_PER_SET - 1) {
      this.inTiebreak = true; // 2-2 -> the next game is a tiebreak
    }
    // Serve alternates each game. The tiebreak already alternated during play, so this keeps
    // the next game's server correct.
    if (!wasTiebreak) this.server = this.server === 'player' ? 'ai' : 'player';
  }

  _pointLabel(side) {
    if (this.inTiebreak) return String(this.tbPts[side]);
    if (this.adv) return this.adv === side ? 'Ad' : '40';
    return ['0', '15', '30', '40'][this.pts[side]] || '40';
  }

  _emitScore() {
    this.onScore({
      mode: this.mode,
      pts: { player: this._pointLabel('player'), ai: this._pointLabel('ai') },
      games: { ...this.games },
      sets: { ...this.sets },
      setsToWin: this.setsToWin,
      inTiebreak: this.inTiebreak,
      server: this.server,
      difficulty: this.difficulty,
      controlMode: this.controlMode,
      matchWinner: this.matchWinner,
      shots: this.playerShots,
      best: this.bestRally,
    });
  }

  _loserOf() {
    // Whoever hit the live ball is the one who errs (net/out); the other wins the point.
    return this.shotBy === 'player' ? 'player' : 'ai';
  }
  _otherOf(who) {
    return who === 'player' ? 'ai' : 'player';
  }

  _updateBall(dt) {
    if (!this.ballInPlay) return;

    this._prevBallZ = this.ball.position.z;
    this.ballVel.y -= GRAVITY * dt;
    this.ball.position.addScaledVector(this.ballVel, dt);

    // Net collision: a ball crossing z=0 below the net is stopped — the hitter loses the point.
    const crossedNet = (this._prevBallZ > 0) !== (this.ball.position.z > 0);
    if (crossedNet && this.phase === 'rally' && this.ball.position.y < NET_HEIGHT) {
      this.ball.position.z = 0;
      this.ballVel.set(0, this.ballVel.y * 0.2, 0);
      const hitter = this._loserOf();
      if (this.serveInFlight) { this._serveFault(); return; }
      this._endPoint(this._otherOf(hitter), 'NET');
      return;
    }

    // Ground contact.
    if (this.ball.position.y <= BALL_RADIUS) {
      this.ball.position.y = BALL_RADIUS;
      if (this.phase === 'serving') { this._beginServe(); return; } // missed toss -> let
      if (!this.hasBounced) {
        this.hasBounced = true;
        const rest = BOUNCE_RESTITUTION + THREE.MathUtils.randFloatSpread(2) * BOUNCE_VARIANCE;
        // Floor the rebound so even a flat, skidding shot sits up enough to be struck.
        this.ballVel.y = Math.max(-this.ballVel.y * rest, MIN_BOUNCE_VY);
        this.ballVel.x *= 0.94;
        this.ballVel.z *= 0.94;
        this._onFirstBounce();
        return;
      }
      // Second bounce: the side that hit it last won (the other failed to return in time).
      if (this.shotBy === 'player') this._endPoint('player', 'WINNER');
      else this._endPoint('ai', 'MISS');
      return;
    }

    // Flew clean out of the arena before ever bouncing -> the hitter loses.
    // This must not apply once the ball has bounced: a good deep shot that the receiver misses
    // stays fast and low and can leave the arena BEFORE its second bounce, which used to get it
    // called out against the player who actually hit the winner. The first bounce is already
    // judged against the lines in _onFirstBounce, so after that only the 2nd bounce decides.
    if (!this.hasBounced &&
        (Math.abs(this.ball.position.x) > COURT.halfWidth + 6 ||
         this.ball.position.z < COURT.opponentBaseline - 6 ||
         this.ball.position.z > COURT.playerBaseline + 6)) {
      this._endPoint(this._otherOf(this._loserOf()), 'OUT');
      return;
    }

    // Contact test (serve toss or the player's rally return).
    this.ballInReach = this._isBallInReach();
    if (this.pendingSwing) {
      if (performance.now() > this.pendingSwing.expiresAt) {
        this.pendingSwing = null;
      } else if (this.phase === 'serving' && this._isBallInReach()) {
        this._strikeShot(this.pendingSwing, true);
        this.pendingSwing = null;
      } else if (this.phase === 'rally' && this.shotBy === 'ai' && this.ballInReach) {
        this._strikeShot(this.pendingSwing, false);
        this.pendingSwing = null;
      }
    }
  }

  _onFirstBounce() {
    const { x, z } = this.ball.position;
    const hitter = this._loserOf();
    const landSide = z < 0 ? 'ai' : 'player'; // which half it bounced in
    const isServe = this.serveInFlight;

    void landSide;
    const boxSign = this._receiverBoxXSign();
    if (hitter === 'player') {
      const good = isServe ? this._inServiceBox(x, z, 'ai', boxSign) : this._inCourt(x, z, 'ai');
      if (!good) { isServe ? this._serveFault() : this._endPoint('ai', 'OUT'); return; }
      // Can the AI reach it in time? distance it must cover vs speed × airtime to the 2nd bounce.
      // In rally mode it always gets there, so the run only ends on the player's own error.
      const cfg = this._ai();
      const reachDist = Math.hypot(this.aiPos.x - x, this.aiPos.z - z);
      const airtime = Math.max(0.45, (2 * Math.abs(this.ballVel.y)) / GRAVITY);
      if (this.mode === 'rally' || reachDist <= cfg.moveSpeed * (airtime + 0.2)) {
        this.aiHitPending = true;
        this.aiHitTimer = Math.min(airtime * 0.7, 0.5);
        this.aiStretch = THREE.MathUtils.clamp(reachDist / (cfg.moveSpeed * airtime + 0.01), 0, 1);
      } else {
        this.aiHitPending = false; // unreachable -> the player wins on the 2nd bounce
      }
    } else { // AI hit
      const good = isServe ? this._inServiceBox(x, z, 'player', boxSign) : this._inCourt(x, z, 'player');
      if (!good) { isServe ? this._serveFault() : this._endPoint('player', 'OUT'); return; }
      // Good and on the player's side — the player must return it before it bounces again.
    }
  }

  // ---------- AI opponent ----------

  _updateAI(dt) {
    if (this.aiSwingT > 0) this.aiSwingT = Math.max(0, this.aiSwingT - dt * 3);
    const cfg = this._ai();
    const b = this.ball.position;

    if (this.aiHitPending) {
      // Run to the ball, then strike it back.
      this._moveAIToward(b.x, THREE.MathUtils.clamp(b.z, COURT.opponentBaseline, -0.5), cfg.moveSpeed, dt);
      this.aiHitTimer -= dt;
      if (this.aiHitTimer <= 0) { this.aiHitPending = false; this._aiHit(cfg); }
    } else if (this.phase === 'rally' && this.shotBy === 'player' && this.ballVel.z < 0) {
      // Ball incoming (not yet bounced): run to where it will land so it can be returned.
      const bounce = this._predictBounce();
      const tz = THREE.MathUtils.clamp(bounce.z - 0.3, COURT.opponentBaseline, -0.5);
      this._moveAIToward(bounce.x, tz, cfg.moveSpeed, dt);
    } else {
      // Recover toward home between shots.
      this._moveAIToward(0, AI_HOME_Z, cfg.moveSpeed * 0.8, dt);
    }

    this.opponent.position.set(this.aiPos.x, 0, this.aiPos.z);
    this.opponent.rotation.z = this.aiSwingT > 0 ? Math.sin(this.aiSwingT * Math.PI) * 0.4 : 0;
  }

  _moveAIToward(tx, tz, speed, dt) {
    const step = speed * dt;
    this.aiPos.x += THREE.MathUtils.clamp(tx - this.aiPos.x, -step, step);
    this.aiPos.z += THREE.MathUtils.clamp(tz - this.aiPos.z, -step, step);
    this.aiPos.x = THREE.MathUtils.clamp(this.aiPos.x, -COURT.halfWidth - 1.2, COURT.halfWidth + 1.2);
    this.aiPos.z = THREE.MathUtils.clamp(this.aiPos.z, COURT.opponentBaseline - 1, -0.5);
  }

  // Integrate the ball forward to its next ground contact, so the AI can run to intercept.
  // Pass an array to also collect the flight path (for the on-screen trajectory line).
  _predictBounce(path) {
    let x = this.ball.position.x, y = this.ball.position.y, z = this.ball.position.z;
    let vy = this.ballVel.y;
    const vx = this.ballVel.x, vz = this.ballVel.z, dt = 1 / 60;
    if (path) path.length = 0;
    for (let i = 0; i < 240; i++) {
      vy -= GRAVITY * dt; x += vx * dt; y += vy * dt; z += vz * dt;
      if (path && i % 3 === 0 && path.length < TRAJ_POINTS * 3) path.push(x, y, z);
      if (y <= BALL_RADIUS) break;
    }
    if (path && path.length < TRAJ_POINTS * 3) path.push(x, Math.max(y, BALL_RADIUS), z);
    return { x: THREE.MathUtils.clamp(x, -COURT.halfWidth - 1, COURT.halfWidth + 1), z };
  }

  _aiHit(cfg) {
    const b = this.ball.position;
    b.y = Math.max(b.y, 0.6);
    this.aiSwingT = 0.5;
    this.serveInFlight = false; // the AI has struck it: it's a rally ball now, not a serve

    // Stretched shots (reached at the edge of range) are more error-prone.
    // Rally mode: the CPU is a flawless feeder, so the run is purely down to the player.
    const stretch = this.aiStretch || 0;
    const errChance = this.mode === 'rally' ? 0 : cfg.errorRate + stretch * 0.18;
    const roll = Math.random();

    // Target: aggressive -> aim away from the player toward a corner; safe -> deep centre.
    const goForIt = Math.random() < cfg.aggression;
    const awayFromPlayer = this.player.position.x >= 0 ? -1 : 1;
    let targetX = goForIt
      ? awayFromPlayer * THREE.MathUtils.randFloat(2.5, COURT.halfWidth - 0.4)
      : THREE.MathUtils.randFloatSpread(2) * 2.2;
    targetX += THREE.MathUtils.randFloatSpread(2) * cfg.aimJitter;
    // Land a bit shorter than the baseline so the player has room to set up behind it.
    let targetZ = THREE.MathUtils.lerp(3.5, COURT.playerBaseline - 3.5, cfg.depth);

    if (roll < errChance * 0.5) {
      // Unforced error into the net: a flat, low ball that won't clear.
      const dz = targetZ - b.z;
      this.ballVel.set((targetX - b.x) * 0.25, -0.5, dz * 0.25);
      this.shotBy = 'ai';
      this.hasBounced = false;
      this.aiState = 'recover';
      return;
    }
    if (roll < errChance) {
      // Unforced error long/wide.
      targetX *= 1.9;
      targetZ = COURT.playerBaseline + THREE.MathUtils.randFloat(1.5, 3.5);
    }

    if (this.mode === 'rally') {
      // Rally mode is a feeding drill, so keep the ball inside the lines: aim jitter alone
      // could otherwise spray it wide and end the run on the CPU's mistake, not the player's.
      targetX = THREE.MathUtils.clamp(targetX, -COURT.halfWidth + 0.6, COURT.halfWidth - 0.6);
      targetZ = THREE.MathUtils.clamp(targetZ, 2.5, COURT.playerBaseline - 1.2);
    }

    // Normal shot: a lofted, net-clearing arc. A higher apex means a longer flight time, so
    // for the same distance the ball travels slower — giving the player time to read it.
    const apex = Math.max(b.y + 0.9, NET_HEIGHT + 1.5 + cfg.pace * 0.6);
    const vy = Math.sqrt(2 * GRAVITY * Math.max(apex - b.y, 0.1));
    const flightTime = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * b.y)) / GRAVITY;
    this.ballVel.set((targetX - b.x) / flightTime, vy, (targetZ - b.z) / flightTime);
    this.shotBy = 'ai';
    this.hasBounced = false;
    this.aiState = 'recover';
    this.rally += 1;
    if (this.mode !== 'rally') this.onRallyChange(this.rally); // rally mode only counts player shots
  }

  // ---------- per-frame ----------

  _updatePlayer(dt) {
    const k = this.keysRef.current;
    const dir = new THREE.Vector3(
      (k.right ? 1 : 0) - (k.left ? 1 : 0),
      0,
      (k.back ? 1 : 0) - (k.forward ? 1 : 0),
    );
    if (dir.lengthSq() > 0) {
      dir.normalize().multiplyScalar(PLAYER_SPEED * dt);
      this.player.position.add(dir);
    }
    // Serving: the player must stay behind the baseline, on the correct (deuce/ad) side.
    const serving = this.server === 'player' && (this.phase === 'awaitServe' || this.phase === 'serving');
    const backLimit = COURT.playerBaseline + PLAYER_RUNBACK;
    if (serving) {
      const minZ = COURT.playerBaseline + 0.3; // behind the baseline
      this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, minZ, backLimit);
      // keep them on the half matching the serve side (deuce = right/+x, ad = left/-x)
      if (this.serveSide === 'deuce') this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, 0.3, COURT.halfWidth - 0.4);
      else this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -COURT.halfWidth + 0.4, -0.3);
    } else {
      this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -COURT.halfWidth - 1.2, COURT.halfWidth + 1.2);
      this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, 0.6, backLimit);
    }
  }

  _updateCamera(dt) {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    this.camera.position.set(px, EYE_HEIGHT, pz);

    // Default gaze: forward toward the far court, roughly level.
    this._camDefault.set(px, 1.1, pz - 14);

    // Track the ball when it's airborne/near — fully during the serve toss — so it stays
    // in frame instead of flying off the top of the screen.
    if (this.ballInPlay) {
      const b = this.ball.position;
      const dist = Math.hypot(b.x - px, b.z - pz);
      const heightW = THREE.MathUtils.clamp((b.y - 0.6) / 2.4, 0, 1);
      const nearW = THREE.MathUtils.clamp(1 - dist / 13, 0, 1);
      let w = Math.max(this.phase === 'serving' ? 0.92 : 0, heightW * 0.75 + nearW * 0.45);
      w = THREE.MathUtils.clamp(w, 0, 0.92);
      this._camDesired.copy(this._camDefault).lerp(b, w);
    } else {
      this._camDesired.copy(this._camDefault);
    }

    // Smooth the look target so the view glides rather than snapping.
    const a = 1 - Math.exp(-dt / 0.09);
    this._camLook.lerp(this._camDesired, a);
    this.camera.lookAt(this._camLook);
  }

  _updateAids() {
    // Contact ring + sweet-spot sit at the stable ground reach point (move as you position/tilt).
    this.reachRing.position.x = this._reachCenter.x;
    this.reachRing.position.z = this._reachCenter.z;
    this.sweetSpot.position.x = this._reachCenter.x;
    this.sweetSpot.position.z = this._reachCenter.z;

    if (this.ballInReach) {
      this._reachRingMat.color.setHex(0x4ecb71);
      this._reachRingMat.opacity = 0.8;
    } else {
      this._reachRingMat.color.setHex(0x3db7ff);
      this._reachRingMat.opacity = 0.28;
    }

    if (this.ballShadow.visible) {
      this.ballShadow.position.x = this.ball.position.x;
      this.ballShadow.position.z = this.ball.position.z;
      const s = THREE.MathUtils.clamp(1 - this.ball.position.y / 6, 0.35, 1);
      this.ballShadow.scale.setScalar(s);
      this.ballShadow.material.opacity = 0.32 * s;
    }

    this._ballMiddled = this.ballInReach && this._ballDistToSweetSpot() < SWEET_RADIUS;
    if (this._ballMiddled) {
      this._sweetMat.color.setHex(0x4ecb71);
      this._sweetMat.opacity = 0.9;
    } else {
      this._sweetMat.color.setHex(0xffc93c);
      this._sweetMat.opacity = 0.5;
    }

    // While an AI shot is on its way over, show where it will land and how it gets there.
    const aiIncoming = this.ballInPlay && this.phase === 'rally'
      && this.shotBy === 'ai' && this.ballVel.z > 0 && !this.hasBounced;

    if (aiIncoming && (this.showPitchLine || this.showTrajectory)) {
      const p = this._predictBounce(this.showTrajectory ? this._trajPath : null);
      this.pitchMarker.position.set(p.x, 0.06, p.z);
      this.pitchMarker.visible = this.showPitchLine;

      if (this.showTrajectory) {
        const pts = this._trajPath;
        const count = Math.min(pts.length / 3, TRAJ_POINTS);
        const arr = this._trajPositions.array;
        for (let i = 0; i < count * 3; i++) arr[i] = pts[i];
        this._trajPositions.needsUpdate = true;
        this.trajectoryLine.geometry.setDrawRange(0, count);
        this.trajectoryLine.visible = count > 1;
      } else {
        this.trajectoryLine.visible = false;
      }
    } else {
      this.pitchMarker.visible = false;
      this.trajectoryLine.visible = false;
    }
  }

  _updateRacket(dt) {
    // Frame-rate-independent smoothing factor (equivalent to a per-frame slerp/lerp).
    const a = 1 - Math.exp(-dt / ORIENT_SMOOTH_TAU);

    if (this.controlMode === 'mouse') {
      // Mouse: sweep the racket with the pointer. This drives the same reach-point maths as
      // the phone's tilt via _upVec — right -> reach right, pointer up -> reach toward the net.
      this._upVec.set(-this._mouse.x * 0.8, 1, this._mouse.y * 0.7);
      this._qRel.setFromEuler(new THREE.Euler(-this._mouse.y * 0.5, -this._mouse.x * 0.6, -this._mouse.x * 0.5));
      this._targetQuat.copy(this._restQuat).multiply(this._qRel);
      this._aimX = THREE.MathUtils.clamp(this._mouse.x, -1, 1);
      // The phone derives its translation from the tilt of its up-axis, which couples "racket
      // up" to "reach back". A pointer has no such constraint, so drive it straight from the
      // cursor: the racket goes where the mouse goes.
      const mtx = THREE.MathUtils.clamp(this._mouse.x * TRANS_X_GAIN, -TRANS_X_MAX, TRANS_X_MAX);
      const mty = THREE.MathUtils.clamp(-this._mouse.y * TRANS_Y_GAIN, -TRANS_Y_MAX, TRANS_Y_MAX);
      this._targetPos.set(
        this._racketRest.pos.x + mtx,
        this._racketRest.pos.y + mty,
        this._racketRest.pos.z,
      );
    } else if (this._hasOrient) {
      // Rotation relative to the calibrated neutral hold, applied 1:1 (see ROT note above).
      this._qRel.copy(this._calibInv).multiply(this._rawTargetQuat);
      this._targetQuat.copy(this._restQuat).multiply(this._qRel);

      // Gimbal-free tilt read from the phone's rotated "up" axis:
      //   up.x -> roll (left/right),  up.z -> pitch (up/down). Signs match the phone's hold.
      this._upVec.set(0, 1, 0).applyQuaternion(this._qRel);
      const tx = THREE.MathUtils.clamp(AXIS_X_SIGN * this._upVec.x * TRANS_X_GAIN, -TRANS_X_MAX, TRANS_X_MAX);
      const ty = THREE.MathUtils.clamp(AXIS_Y_SIGN * this._upVec.z * TRANS_Y_GAIN, -TRANS_Y_MAX, TRANS_Y_MAX);
      this._aimX = THREE.MathUtils.clamp(AXIS_X_SIGN * this._upVec.x / AIM_FULL, -1, 1);
      this._targetPos.set(this._racketRest.pos.x + tx, this._racketRest.pos.y + ty, this._racketRest.pos.z);
    } else {
      this._targetQuat.copy(this._restQuat);
      this._targetPos.copy(this._racketRest.pos);
    }

    // Ease toward the target, but never rotate faster than the cap — so a jumped sensor
    // reading becomes one smooth sweep instead of a snap.
    const angle = this._racketQuat.angleTo(this._targetQuat);
    if (angle > 1e-4) {
      const step = Math.min(angle * a, RACKET_MAX_RAD_PER_SEC * dt);
      this._racketQuat.rotateTowards(this._targetQuat, step);
    }
    this._racketPos.lerp(this._targetPos, a);

    if (this._swingAnimT > 0) {
      // A detected swing adds an exaggerated forehand sweep on top of the tracked pose.
      this._swingAnimT = Math.max(0, this._swingAnimT - dt * 4.5);
      const s = Math.sin(this._swingAnimT * Math.PI);
      this._swingQuat.setFromEuler(new THREE.Euler(-s * 0.9, s * 1.2, s * 0.2));
      this.racketGroup.quaternion.copy(this._racketQuat).multiply(this._swingQuat);
      this.racketGroup.position.set(this._racketPos.x, this._racketPos.y, this._racketPos.z - s * 0.22);
    } else {
      this.racketGroup.quaternion.copy(this._racketQuat);
      this.racketGroup.position.copy(this._racketPos);
    }

    if (this._hitFlashT > 0) {
      this._hitFlashT = Math.max(0, this._hitFlashT - dt * 3);
      this.racketHead.scale.setScalar(1 + this._hitFlashT * 0.3);
    } else {
      this.racketHead.scale.setScalar(1);
    }

    this.racketHead.updateWorldMatrix(true, false);
    this.racketHead.getWorldPosition(this._headWorld); // visual only

    // Stable ground reach point in front of the player, nudged by phone tilt. Used for all
    // hit tests + the ground rings — independent of camera pitch so low balls stay reachable.
    const nudgeX = THREE.MathUtils.clamp(AXIS_X_SIGN * this._upVec.x * REACH_TILT_X, -REACH_TILT_X, REACH_TILT_X);
    const nudgeZ = THREE.MathUtils.clamp(this._upVec.z * REACH_TILT_Z, -REACH_TILT_Z, REACH_TILT_Z);
    this._reachCenter.set(
      this.player.position.x + REACH_FWD_X + nudgeX,
      0,
      this.player.position.z + REACH_FWD_Z + nudgeZ,
    );
  }

  _resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _loop = () => {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.paused) {
      this.renderer.render(this.scene, this.camera); // frozen frame
      requestAnimationFrame(this._loop);
      return;
    }

    this._updatePlayer(dt);
    this._updateCamera(dt);
    this._updateRacket(dt); // before the ball, so hit-testing sees the current racket pose

    if (this.phase === 'intermission') {
      this._updateIntermission(dt);
    } else if (this.phase === 'aiServePending') {
      this.aiServeTimer -= dt;
      if (this.aiServeTimer <= 0) this._aiServe();
    } else if (this.phase === 'serving' || this.phase === 'rally') {
      this._updateBall(dt);
      this._updateAI(dt);
    }

    this._updateAids();

    this.renderer.render(this.scene, this.camera);

    requestAnimationFrame(this._loop);
  };
}
