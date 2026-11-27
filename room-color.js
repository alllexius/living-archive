/* ============================================================
   THE ROOM — the screen lights the room, the camera reads the
   room, the page answers by shifting the screen's color until
   the room reads as grey.

   Everything happens in this file, in this browser. Camera
   frames are drawn to a 64×48 canvas, averaged, and thrown
   away. Nothing is stored or sent. The only thing that leaves
   the page is the email the visitor sends themselves, from
   their own mail app.

   PHASES
     gate        → visitor presses Begin (camera, fullscreen)
     conditions  → page measures the room, reports what is met
     running     → the room is held at grey

   1. MEASURING THE ROOM
     The screen shows white, the camera reads. The screen shows
     black, the camera reads. Per channel (R, G, B, linear):
         A = black reading          the room's own light
         K = white − black          what the screen adds at full
     A carries the room's existing color AND its brightness.
     K carries the screen's real effect on the room: its
     luminosity, its distance, the color of the walls it hits.
         share = lum(K) / lum(white)
     = fraction of the light on the visitor that comes from the
     screen. The page waits for share ≥ CFG.shareThreshold.

   2. SOLVING FOR GREY
     The room under the screen is A + K·s, where s is the
     screen color (0–1 per channel). Grey means all three
     channels equal:  A_c + K_c·s_c = L. The brightest grey the
     screen can reach: L = min_c(A_c + K_c). Then
         s_c = (L − A_c) / K_c
     A blue room gives s with blue held back: a pale warm light.

   3. MUTING
     The screen is never allowed past CFG.maxSat (0 = white,
     1 = one pure primary). A saturated screen reads as a
     glowing object; a pale one reads as light. If the room's
     own color is too strong to cancel within the cap, the page
     cancels what it can and asks for less room light: less A
     means less color to cancel.

   4. HOLDING
     The camera keeps reading. Small, bounded corrections (trim)
     absorb what the model missed. Movement tilts the color a
     little, by where it happens, and relaxes over ~17 s. Trim
     and tilt both pass through the mute cap: the result is
     always muted.

   WITHOUT A COLOR LOCK
     A camera that balances color by itself reads every room as
     grey, so it cannot see A's color. The page then estimates
     the room's color from the camera's reported color
     temperature, where the browser gives one, holds a fixed
     model, and never trims. (Trimming against an auto-balancing
     camera runs away to full saturation: the version 1 fault.)
   ============================================================ */

(() => {
'use strict';

/* ---- Change here: behaviour --------------------------------- */
const CFG = {
  shareThreshold: 0.6,   // share of light from the screen to begin
  maxSat:        0.22,   // most color the screen may carry (0–1)
  greyEnough:    0.04,   // predicted room color below this = grey
  probeFrames:      8,   // frames averaged per reading
  settleMs:       450,   // wait after each measuring step
  aeSettleMs:     900,   // wait for auto exposure before locking it
  recheckMs:     2500,   // pause between checks while not met
  tickMs:          66,   // loop rate (~15 per second)
  trimGain:     0.008,   // correction per tick (log units)
  trimMax:       0.12,   // largest correction
  trimLeak:     0.999,   // trim relaxes toward the model
  motionThreshold:  5,   // 0–255; below this, stillness
  motionKick:   0.012,   // tilt added per tick of movement
  motionDecay:  0.996,   // per tick; ≈ 17 s to fade
  maxTilt:       0.10,   // largest tilt (log units)
  brightJump:     1.8,   // exposure locked: room ×1.8 → re-measure
  logEveryMs:   10000,   // one line in the email per 10 s of change
  logMax:          60,
  idleMs:        3000,   // panel + pointer fade after stillness
};

/* ---- Change here: words ------------------------------------- */
const COPY = {
  noCamera:     'No camera was found, or access was refused.',
  noSecure:     'The camera needs this page to be opened over https.',
  balanceLock:  'Camera color held',
  balanceTemp:  'This camera balances color by itself. The room\u2019s color is estimated.',
  balanceFree:  'This camera balances color by itself. The room\u2019s color cannot be read.',
  blind:        'The camera sees almost nothing. Uncover it, or sit facing the screen.',
  muchTooBright:'Please turn off the lights in the room, or close the curtains.',
  tooBright:    'Please lower the light in the room a little more.',
  tooColored:   'The room\u2019s own light is too colored to mute. Please lower it further.',
  muteMet:      'Room color muted',
  muteWeak:     'Room color partly muted',
  muteUnknown:  'Room color',
  met:          'Held.',
  ended:        'The camera has stopped.',
  mailSubject:  'The Room \u2014 alexius.studio',
};

/* ---- Color math (pure; tested outside the browser) ---------- */
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
const lum = v => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
/* Scale so the brightest channel = 1: color without brightness. */
const top1 = v => { const m = Math.max(v[0], v[1], v[2]); return m > 0 ? v.map(c => c / m) : [1, 1, 1]; };
/* Color strength: 0 = grey/white, 1 = a pure primary. */
function sat(v) {
  const hi = Math.max(v[0], v[1], v[2]), lo = Math.min(v[0], v[1], v[2]);
  return hi > 0 ? 1 - lo / hi : 0;
}
/* §2. Screen color that makes A + K·s grey, brightest possible. */
function solveGrey(A, K) {
  const k = K.map(x => Math.max(x, 1e-6));
  const L = Math.min(A[0] + k[0], A[1] + k[1], A[2] + k[2]);
  return top1(A.map((a, c) => Math.max(0, (L - a) / k[c])));
}
/* §3. Pull s toward white until its color ≤ max. */
function mute(s, max) {
  s = top1(s);
  const v = sat(s);
  if (v <= max) return s;
  const f = max / v;
  return s.map(x => 1 - (1 - x) * f);
}
/* Movement direction on the hue circle; sums to zero. */
function hueVector(theta) {
  const k = 2 * Math.PI / 3;
  return [Math.cos(theta), Math.cos(theta - k), Math.cos(theta + k)];
}
/* Color temperature (K) → linear sRGB chroma, brightest = 1.
   Planckian locus approximation, Kim et al. 2002, 1667–25000 K. */
function cctToLin(T) {
  T = Math.min(25000, Math.max(1667, T));
  const t = 1e3 / T, t2 = t * t, t3 = t2 * t;
  const x = T <= 4000
    ? -0.2661239 * t3 - 0.2343589 * t2 + 0.8776956 * t + 0.179910
    : -3.0258469 * t3 + 2.1070379 * t2 + 0.2226347 * t + 0.240390;
  const x2 = x * x, x3 = x2 * x;
  const y = T <= 2222 ? -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683
          : T <= 4000 ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
          :              3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;
  const X = x / y, Z = (1 - x - y) / y;            // Y = 1
  const rgb = [
     3.2406 * X - 1.5372 - 0.4986 * Z,
    -0.9689 * X + 1.8758 + 0.0415 * Z,
     0.0557 * X - 0.2040 + 1.0570 * Z,
  ].map(c => Math.max(0, c));
  return top1(rgb);
}
const MATH = { LUT, linToSrgb8, hex, lum, sat, top1, solveGrey, mute, hueVector, cctToLin };
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
let caps = { balance: false, exposure: false, temp: false };
let model = null;               // { A, K, s, residual } from the last measurement
let shown = [1, 1, 1];          // screen color on display, linear
let trim = [0, 0, 0], tilt = [0, 0, 0];
let prevGray = null, probing = false, timer = null;
let roomAtStart = null, baseLum = null, brightTicks = 0;
let log = [], lastLogAt = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const setField = lin => { field.style.backgroundColor = hex(lin); };
function mark(name, state, label) {
  const li = cond(name);
  li.classList.remove('rc-met', 'rc-unmet', 'rc-weak');
  if (state) li.classList.add('rc-' + state);
  if (label) { const l = li.querySelector('.rc-label'); if (l) l.textContent = label; }
}
function show(which) {
  for (const k in panels) panels[k].hidden = (k !== which);
  panels[which].classList.remove('rc-faded');
}

/* ---- Reading the camera ------------------------------------- */
/* Mean color in linear light, skipping clipped pixels, plus a
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
async function meanRGB(frames) {
  const sum = [0, 0, 0]; let k = 0;
  for (let i = 0; i < frames; i++) {
    const f = readFrame();
    if (f && f.lin) { f.lin.forEach((v, c) => { sum[c] += v; }); k++; }
    await sleep(40);
  }
  return k ? sum.map(v => v / k) : [0, 0, 0];
}

/* ---- Camera controls (where the browser + camera allow) ----- */
async function applyAdv(c) {
  try { await track.applyConstraints({ advanced: [c] }); return true; }
  catch (e) { return false; }
}
async function lockBalance() {
  const cap = track.getCapabilities ? track.getCapabilities() : {};
  caps.exposure = (cap.exposureMode || []).includes('manual');
  caps.temp = !!cap.colorTemperature;
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
/* The camera's own estimate of the light's color temperature,
   when it balances by itself and the browser reports it. */
function reportedCCT() {
  const s = track.getSettings ? track.getSettings() : {};
  return s.colorTemperature > 0 ? s.colorTemperature : null;
}

/* ---- §1 Measuring ------------------------------------------- */
/* White, read, black, read. One cycle every few seconds —
   well under the rate that matters for photosensitivity. */
async function measure() {
  probing = true;
  field.classList.add('rc-instant');

  setField([1, 1, 1]);
  await sleep(CFG.settleMs);
  await lockExposure();                    // exposure set by the lit room
  const white = await meanRGB(CFG.probeFrames);

  setField([0, 0, 0]);
  await sleep(CFG.settleMs);
  const black = await meanRGB(CFG.probeFrames);
  const cct = caps.balance ? null : reportedCCT();

  let A = black;
  let K = white.map((w, c) => Math.max(1e-6, w - black[c]));
  const share = lum(white) > 0 ? Math.min(1, lum(K) / lum(white)) : 0;

  if (!caps.balance) {
    /* The camera grey-balanced both readings, so their colors
       are not the room's. Keep the brightness split, replace
       the colors: room from the reported temperature (or
       unknown = neutral), screen = neutral white. */
    const a = cct ? cctToLin(cct) : [1, 1, 1];
    const la = lum(a);
    A = a.map(v => v / la * (1 - share));
    K = [share, share, share];
  }

  const s = mute(solveGrey(A, K), CFG.maxSat);
  const predicted = A.map((a, c) => a + K[c] * s[c]);
  model = { A, K, s, residual: sat(predicted) };
  if (!roomAtStart) roomAtStart = top1(A);

  setField(shown);
  await sleep(50);
  field.classList.remove('rc-instant');
  probing = false;
  return { white: lum(white), share, cct };
}

async function checkRoom() {
  phase = 'conditions';
  document.body.classList.add('rc-live');
  show('conditions');
  $('rc-meter-mark').style.left = (CFG.shareThreshold * 100) + '%';
  while (phase === 'conditions') {
    const { white, share, cct } = await measure();
    if (phase !== 'conditions') return;
    $('rc-meter-fill').style.width = Math.min(100, share * 100) + '%';
    const instr = $('rc-instruction');
    const bright = share >= CFG.shareThreshold;
    const grey = model.residual <= CFG.greyEnough;
    const known = caps.balance || !!cct;

    mark('dark', bright ? 'met' : share >= CFG.shareThreshold / 2 ? 'weak' : 'unmet');
    if (!known)      mark('mute', 'weak', COPY.muteUnknown);
    else if (grey)   mark('mute', 'met',  COPY.muteMet);
    else             mark('mute', 'weak', COPY.muteWeak);

    if (white < 0.004) {
      mark('dark', 'unmet'); instr.textContent = COPY.blind;
    } else if (!bright) {
      instr.textContent = share < CFG.shareThreshold / 2 ? COPY.muchTooBright : COPY.tooBright;
    } else if (known && !grey) {
      instr.textContent = COPY.tooColored;
    } else {
      instr.textContent = COPY.met;
      await sleep(1500);
      return run();
    }
    await sleep(CFG.recheckMs);
  }
}

/* ---- §4 Holding --------------------------------------------- */
function run() {
  phase = 'running';
  show('during');
  baseLum = null; brightTicks = 0; prevGray = null;
  trim = [0, 0, 0];
  idle();
  clearInterval(timer);
  timer = setInterval(tick, CFG.tickMs);
}

const zeroMean = v => { const m = (v[0] + v[1] + v[2]) / 3; return v.map(x => x - m); };
function clampMag(v, max) {
  const m = Math.hypot(v[0], v[1], v[2]);
  return m > max ? v.map(x => x * max / m) : v;
}

function tick() {
  if (probing || document.hidden || !model) return;
  const f = readFrame();
  if (!f || !f.lin) return;

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
      tilt = clampMag(tilt.map((t, c) => t + v[c] * amt), CFG.maxTilt);
    }
  }
  prevGray = f.gray;
  tilt = tilt.map(t => t * CFG.motionDecay);

  /* Trim only when the camera's color is locked: otherwise the
     camera already reads grey and trim would chase nothing. */
  if (caps.balance) {
    const m = (f.lin[0] + f.lin[1] + f.lin[2]) / 3;
    if (m > 1e-5) {
      const err = zeroMean(f.lin.map(v => Math.log(Math.max(v, 1e-6) / m)));
      trim = clampMag(trim.map((t, c) => (t - CFG.trimGain * err[c]) * CFG.trimLeak), CFG.trimMax);
    }
  }

  const adj = zeroMean(trim.map((t, c) => t + tilt[c]));
  shown = mute(model.s.map((x, c) => Math.max(1e-4, x) * Math.exp(adj[c])), CFG.maxSat);
  setField(shown);

  /* With exposure locked, a sudden rise means a light came on. */
  if (caps.exposure) {
    const l = lum(f.lin);
    baseLum = baseLum === null ? l : baseLum * 0.99 + l * 0.01;
    brightTicks = l > baseLum * CFG.brightJump ? brightTicks + 1 : 0;
    if (brightTicks > 15) { clearInterval(timer); return checkRoom(); }
  }

  const sh = hex(shown), rh = hex(top1(f.lin));
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
  caps.balance = await lockBalance();
  mark('balance', caps.balance ? 'met' : 'weak',
       caps.balance ? COPY.balanceLock : caps.temp ? COPY.balanceTemp : COPY.balanceFree);
  model = null; shown = [1, 1, 1]; trim = [0, 0, 0]; tilt = [0, 0, 0];
  log = []; roomAtStart = null; lastLogAt = 0;
  checkRoom();
}

function end(message) {
  phase = 'gate';
  clearInterval(timer);
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = track = null;
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  document.body.classList.remove('rc-live', 'rc-still');
  setField([0, 0, 0]);
  show('gate');
  $('rc-gate-msg').textContent = typeof message === 'string' ? message : '';
}

/* ---- Stillness: panel and pointer fade ---------------------- */
let idleTimer = null;
function idle() {
  document.body.classList.remove('rc-still');
  if (phase === 'running') panels.during.classList.remove('rc-faded');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (phase !== 'running') return;
    document.body.classList.add('rc-still');
    panels.during.classList.add('rc-faded');
  }, CFG.idleMs);
}
['pointermove', 'keydown', 'touchstart'].forEach(e => addEventListener(e, idle, { passive: true }));

/* The wake lock is dropped when the tab is hidden; take it back. */
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && stream && !wakeLock) await holdWake();
});

$('rc-begin').addEventListener('click', begin);
$('rc-end').addEventListener('click', () => end());
$('rc-mail').addEventListener('click', mail);
window.RoomColor = MATH;   // for testing from the console
})();
