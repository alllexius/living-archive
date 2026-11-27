/* ============================================================
   ROOM — the screen lights the room, the camera reads the
   room, the page answers by shifting the screen's colour.

   Everything happens in this file, in this browser. Camera
   frames are drawn to a 64×48 canvas, averaged, and thrown
   away. Nothing is stored or sent. The only thing that leaves
   the page is the email the visitor sends themselves, from
   their own mail app.

   PHASES
     gate        → visitor presses Begin (camera, fullscreen)
     conditions  → page checks the room, reports what is met
     running     → the loop

   THE MEASURE OF "TOO BRIGHT"
     A camera's absolute brightness reading means little: auto
     exposure rescales it. So the page measures a ratio. It
     shows full white, reads, shows black, reads:
         share = (white − black) / white
     = the fraction of light on the visitor that comes from
     the screen. 1.0 = the screen is the only light. The loop
     starts when share ≥ CFG.shareThreshold.

   THE LOOP
     Each tick the camera's mean colour (linear light) is
     compared with neutral grey. The screen's colour moves a
     small step against the difference, in log space. A blue
     room pushes the screen toward orange until the camera
     reads the room as grey. Screen luminance stays at maximum
     for the colour: only the colour moves.

   SHADOWS
     Frame-to-frame change (with the global change removed)
     detects movement. Where it happens, left to right, picks a
     direction on the hue circle; the target tilts that way and
     relaxes back over ~15 s.
   ============================================================ */

(() => {
'use strict';

/* ---- Change here: behaviour --------------------------------- */
const CFG = {
  shareThreshold: 0.6,  // share of light from the screen to begin
  settleMs:       450,  // wait after each brightness-check step
  aeSettleMs:     900,  // wait for auto exposure before locking it
  recheckMs:     2500,  // pause between checks while too bright
  tickMs:          66,  // loop rate (~15 per second)
  gain:          0.03,  // step size per tick; larger = faster, may oscillate
  floor:         0.04,  // lowest a screen channel may go (linear)
  motionThreshold: 5,   // 0–255; below this, stillness
  motionKick:    0.04,  // hue tilt added per tick of movement
  motionDecay:  0.996,  // per tick; 0.996 at 15/s ≈ 17 s to fade
  maxTilt:       0.30,  // largest tilt (log units)
  brightJump:     1.8,  // with exposure locked: room light ×1.8 → recheck
  logEveryMs:   10000,  // one line in the email per 10 s of change
  logMax:          60,
  idleMs:        3000,  // panel + pointer fade after this much stillness
};

/* ---- Change here: words ------------------------------------- */
const COPY = {
  noCamera:     'No camera was found, or access was refused.',
  noSecure:     'The camera needs this page to be opened over https.',
  balanceLock:  'Camera colour held',
  balanceFree:  'This camera corrects colour by itself. The response will be weaker.',
  roomLabel:    'Room light',
  blind:        'The camera sees almost nothing. Uncover it, or sit facing the screen.',
  muchTooBright:'Please turn off the lights in the room, or close the curtains.',
  tooBright:    'Please lower the light in the room a little more.',
  met:          'Held.',
  ended:        'The camera has stopped.',
  mailSubject:  'Room colour — alexius.studio',
};

/* ---- Colour math (pure; tested outside the browser) --------- */
const LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  LUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linToSrgb8(l) {
  l = Math.min(1, Math.max(0, l));
  const v = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return Math.round(v * 255);
}
function hex(lin) {
  return '#' + lin.map(c => linToSrgb8(c).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/* Scale so the brightest channel = 1: colour without brightness. */
function chroma(lin) {
  const m = Math.max(lin[0], lin[1], lin[2]);
  return m > 0 ? lin.map(c => c / m) : [0, 0, 0];
}
/* One step of the loop. logS = screen colour (log), room =
   camera mean (linear), tilt = target offset (log, zero-mean). */
function step(logS, room, tilt, gain, floor) {
  const m = (room[0] + room[1] + room[2]) / 3;
  if (m < 1e-5) return logS;
  const next = logS.map((s, c) =>
    s - gain * (Math.log(Math.max(room[c], 1e-6) / m) - tilt[c]));
  const top = Math.max(...next);
  const lo = Math.log(floor);
  return next.map(s => Math.max(lo, s - top));   // max channel = 1
}
/* Direction on the hue circle for an angle; sums to zero. */
function hueVector(theta) {
  const k = 2 * Math.PI / 3;
  return [Math.cos(theta), Math.cos(theta - k), Math.cos(theta + k)];
}
const MATH = { LUT, linToSrgb8, hex, chroma, step, hueVector };
if (typeof module !== 'undefined') { module.exports = MATH; return; }

/* ---- Elements ----------------------------------------------- */
const $ = id => document.getElementById(id);
const field = $('rc-field'), video = $('rc-video'), canvas = $('rc-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const W = canvas.width, H = canvas.height;
const panels = { gate: $('rc-gate'), conditions: $('rc-conditions'), during: $('rc-during') };
const cond = name => document.querySelector(`[data-cond="${name}"]`);

/* ---- State -------------------------------------------------- */
let phase = 'gate';
let stream = null, track = null, wakeLock = null;
let caps = { balance: false, exposure: false };
let logS = [0, 0, 0];              // screen colour, log; [0,0,0] = white
let tilt = [0, 0, 0];
let prevGray = null;
let probing = false;
let timer = null;
let lastRoom = null, roomAtStart = null;
let baseLum = null, brightTicks = 0;
let log = [], lastLogAt = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const screenLin = () => logS.map(Math.exp);

function setField(lin) {
  field.style.backgroundColor = hex(lin);
}
function mark(name, state, label) {
  const li = cond(name);
  li.classList.remove('rc-met', 'rc-unmet', 'rc-weak');
  li.classList.add('rc-' + state);
  if (label) { const l = li.querySelector('.rc-label'); if (l) l.textContent = label; }
}
function show(which) {
  for (const k in panels) panels[k].hidden = (k !== which);
  panels[which].classList.remove('rc-faded');
}

/* ---- Reading the camera ------------------------------------- */
/* Mean colour in linear light, skipping clipped pixels, plus a
   small grey image for movement. */
function readFrame() {
  if (video.readyState < 2) return null;
  ctx.drawImage(video, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const gray = new Float32Array(W * H);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const R = d[i], G = d[i + 1], B = d[i + 2];
    gray[p] = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    if (R >= 250 || G >= 250 || B >= 250) continue;
    r += LUT[R]; g += LUT[G]; b += LUT[B]; n++;
  }
  const lin = n > W * H * 0.1 ? [r / n, g / n, b / n] : null;
  return { lin, gray };
}
async function meanLum(frames) {
  let sum = 0, k = 0;
  for (let i = 0; i < frames; i++) {
    const f = readFrame();
    if (f && f.lin) { sum += 0.2126 * f.lin[0] + 0.7152 * f.lin[1] + 0.0722 * f.lin[2]; k++; }
    await sleep(40);
  }
  return k ? sum / k : 0;
}

/* ---- Camera controls (where the browser + camera allow) ----- */
async function applyAdv(c) {
  try { await track.applyConstraints({ advanced: [c] }); return true; }
  catch (e) { return false; }
}
async function lockBalance() {
  const cap = track.getCapabilities ? track.getCapabilities() : {};
  caps.exposure = (cap.exposureMode || []).includes('manual');
  if (!(cap.whiteBalanceMode || []).includes('manual')) return false;
  const c = { whiteBalanceMode: 'manual' };
  if (cap.colorTemperature) {            // fix at daylight, ~D65
    const { min, max } = cap.colorTemperature;
    c.colorTemperature = Math.min(max, Math.max(min, 6500));
  }
  return applyAdv(c);
}
async function lockExposure() {
  if (!caps.exposure) return;
  await applyAdv({ exposureMode: 'continuous' });
  await sleep(CFG.aeSettleMs);
  const s = track.getSettings ? track.getSettings() : {};
  const c = { exposureMode: 'manual' };
  if (s.exposureTime) c.exposureTime = s.exposureTime;
  await applyAdv(c);
}

/* ---- The brightness check ----------------------------------- */
/* White, read, black, read. One cycle every few seconds —
   well under the rate that matters for photosensitivity. */
async function probe() {
  probing = true;
  field.classList.add('rc-instant');
  setField([1, 1, 1]);
  await sleep(CFG.settleMs);
  await lockExposure();
  const white = await meanLum(5);
  const f = readFrame();
  if (f && f.lin && !roomAtStart) roomAtStart = chroma(f.lin);
  setField([0, 0, 0]);
  await sleep(CFG.settleMs);
  const black = await meanLum(5);
  setField(screenLin());
  await sleep(50);
  field.classList.remove('rc-instant');
  probing = false;
  return { white, share: white > 0 ? Math.max(0, (white - black) / white) : 0 };
}

async function checkRoom() {
  phase = 'conditions';
  show('conditions');
  $('rc-meter-mark').style.left = (CFG.shareThreshold * 100) + '%';
  while (phase === 'conditions') {
    const { white, share } = await probe();
    if (phase !== 'conditions') return;
    $('rc-meter-fill').style.width = Math.min(100, share * 100) + '%';
    const instr = $('rc-instruction');
    if (white < 0.004) {
      mark('dark', 'unmet'); instr.textContent = COPY.blind;
    } else if (share >= CFG.shareThreshold) {
      mark('dark', 'met'); instr.textContent = COPY.met;
      await sleep(1500);
      return run();
    } else {
      mark('dark', share >= CFG.shareThreshold / 2 ? 'weak' : 'unmet');
      instr.textContent = share < CFG.shareThreshold / 2 ? COPY.muchTooBright : COPY.tooBright;
    }
    await sleep(CFG.recheckMs);
  }
}

/* ---- The loop ----------------------------------------------- */
function run() {
  phase = 'running';
  show('during');
  baseLum = null; brightTicks = 0; prevGray = null;
  idle();
  clearInterval(timer);
  timer = setInterval(tick, CFG.tickMs);
}

function tick() {
  if (probing || document.hidden) return;
  const f = readFrame();
  if (!f || !f.lin) return;
  lastRoom = f.lin;

  /* Movement: change between frames, minus the change shared
     by the whole frame (the screen's own drift). */
  if (prevGray) {
    let md = 0;
    for (let i = 0; i < f.gray.length; i++) md += f.gray[i] - prevGray[i];
    md /= f.gray.length;
    let dev = 0, cx = 0;
    for (let i = 0; i < f.gray.length; i++) {
      const a = Math.abs(f.gray[i] - prevGray[i] - md);
      dev += a; cx += a * (i % W);
    }
    const mean = dev / f.gray.length;
    if (mean > CFG.motionThreshold) {
      const x = 1 - (cx / dev) / W;          // mirror: visitor's left = left
      const v = hueVector(2 * Math.PI * x);
      const amt = CFG.motionKick * Math.min(3, mean / CFG.motionThreshold);
      tilt = tilt.map((t, c) => t + v[c] * amt);
      const mag = Math.hypot(...tilt);
      if (mag > CFG.maxTilt) tilt = tilt.map(t => t * CFG.maxTilt / mag);
    }
  }
  prevGray = f.gray;
  tilt = tilt.map(t => t * CFG.motionDecay);

  logS = step(logS, f.lin, tilt, CFG.gain, CFG.floor);
  const s = screenLin();
  setField(s);

  /* With exposure locked, a sudden rise means a light came on. */
  if (caps.exposure) {
    const lum = 0.2126 * f.lin[0] + 0.7152 * f.lin[1] + 0.0722 * f.lin[2];
    baseLum = baseLum === null ? lum : baseLum * 0.99 + lum * 0.01;
    brightTicks = lum > baseLum * CFG.brightJump ? brightTicks + 1 : 0;
    if (brightTicks > 15) { clearInterval(timer); return checkRoom(); }
  }

  const sh = hex(s), rh = hex(chroma(f.lin));
  $('rc-hex-screen').textContent = sh;
  $('rc-hex-room').textContent = rh;
  const now = performance.now();
  if (now - lastLogAt > CFG.logEveryMs) {
    const last = log[log.length - 1];
    if (!last || last.screen !== sh) {
      log.push({ time: new Date(), screen: sh, room: rh });
      if (log.length > CFG.logMax) log.shift();
    }
    lastLogAt = now;
  }
}

/* ---- Email (the visitor's own mail app; no server) ---------- */
function mail() {
  const t = d => d.toTimeString().slice(0, 5);
  const lines = [
    new Date().toDateString(),
    '',
    roomAtStart ? 'Room at start   ' + hex(roomAtStart) : '',
    '',
    'time   screen    room',
    ...log.map(e => `${t(e.time)}  ${e.screen}  ${e.room}`),
    '',
    'alexius.studio',
  ];
  location.href = 'mailto:?subject=' + encodeURIComponent(COPY.mailSubject) +
                  '&body=' + encodeURIComponent(lines.join('\n'));
}

/* ---- Begin / end -------------------------------------------- */
async function holdWake() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) {}
}

async function begin() {
  const msg = $('rc-gate-msg');
  if (!window.isSecureContext || !navigator.mediaDevices) { msg.textContent = COPY.noSecure; return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (e) { msg.textContent = COPY.noCamera; return; }
  track = stream.getVideoTracks()[0];
  track.addEventListener('ended', () => end(COPY.ended));
  video.srcObject = stream;
  await video.play().catch(() => {});
  try { await document.documentElement.requestFullscreen(); } catch (e) {}
  await holdWake();

  show('conditions');
  mark('camera', 'met');
  const held = await lockBalance();
  mark('balance', held ? 'met' : 'weak', held ? COPY.balanceLock : COPY.balanceFree);
  logS = [0, 0, 0]; tilt = [0, 0, 0]; log = []; roomAtStart = null; lastLogAt = 0;
  checkRoom();
}

function end(message) {
  phase = 'gate';
  clearInterval(timer);
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = track = null;
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  setField([0, 0, 0]);
  show('gate');
  $('rc-gate-msg').textContent = typeof message === 'string' ? message : '';
}

/* ---- Stillness: panel and pointer fade ---------------------- */
let idleTimer = null;
function idle() {
  document.body.classList.remove('rc-still');
  $('site-title').classList.remove('rc-faded');
  if (phase === 'running') panels.during.classList.remove('rc-faded');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (phase !== 'running') return;
    document.body.classList.add('rc-still');
    $('site-title').classList.add('rc-faded');
    panels.during.classList.add('rc-faded');
  }, CFG.idleMs);
}
['pointermove', 'keydown', 'touchstart'].forEach(e => addEventListener(e, idle, { passive: true }));

/* The wake lock is dropped when the tab is hidden; take it back. */
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && stream && !wakeLock) {
    await holdWake();
  }
});

$('rc-begin').addEventListener('click', begin);
$('rc-end').addEventListener('click', () => end());
$('rc-mail').addEventListener('click', mail);
window.RoomColor = MATH;   // for testing from the console
})();
