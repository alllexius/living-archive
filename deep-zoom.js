/* ============================================================
   deep-zoom.js — v1

   Go into an entry that is held open until it stops being a
   picture. Past the file's own resolution its pixels take over,
   and then its noise is all there is.

   Works in both places an entry is held open:
     #drift-focus   field-drift.html
     #zoom-layer    field-notes.html (opened by interference.js)

   One line, AFTER interference.js, on each page:
     <script src="deep-zoom.js?v=1"></script>

   Scroll down or pinch apart to go in; scroll up or pinch to
   come back. Drag to move across it.
   A click while inside returns to the whole image; a click on
   the whole image closes it, as before.

   Drawn on a canvas, so it is exact on every browser: no
   browser decides how sharp a scaled element should look.
   ============================================================ */

(function () {
  "use strict";

  var DEEP = {
    MAX_PX:     16,   // at the deepest, one pixel of the file covers this many screen pixels
    NOISE_FROM: 2.5,  // the pixels begin to show through here
    NOISE_FULL: 7,    // and nothing else remains by here
    EASE:       6     // how quickly the view follows the hand; lower drifts slower
  };

  var hosts = [];
  ["drift-focus", "zoom-layer"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) hosts.push(el);
  });
  if (!hosts.length) return;

  // Its own few rules, so no stylesheet needs editing.
  var css = document.createElement("style");
  css.textContent =
    ".dz-canvas{position:fixed;left:0;top:0;z-index:5;display:none;touch-action:none}" +
    ".dz-canvas.on{display:block}" +
    ".dz-armed img,.dz-armed video,#zoom-layer.dz-armed{touch-action:none}" +
    ".dz-hide{visibility:hidden!important}";
  document.head.appendChild(css);


  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, v) {
    var t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function copy(r) { return { x: r.x, y: r.y, w: r.w, h: r.h }; }

  var S = null;        // the one entry currently held open
  var quiet = 0;       // time of the last drag; the click that ends it is swallowed


  /* ---- opening and closing --------------------------------------- */
  function arm(host) {
    clearTimeout(host._dzReset);
    reset(host);
    var m = host.querySelector("img, video");
    if (!m) { S = null; return; }

    var c = host._dzCanvas;
    if (!c) {
      c = document.createElement("canvas");
      c.className = "dz-canvas";
      c.setAttribute("aria-hidden", "true");
      host._dzCanvas = c;
    }
    if (!c.isConnected) host.appendChild(c);   // interference.js empties its layer
    host.classList.add("dz-armed");

    S = { host: host, media: m, canvas: c, ctx: c.getContext("2d"),
          live: false, closing: false, last: 0 };
  }

  function disarm(host) {
    host.classList.remove("dz-armed");
    if (S && S.host === host) S.closing = true;
    // The view recedes with the fade as it is, then is made whole.
    clearTimeout(host._dzReset);
    host._dzReset = setTimeout(function () {
      reset(host);
      if (S && S.host === host && S.closing) S = null;
    }, 3200);
  }

  function reset(host) {
    if (host._dzCanvas) host._dzCanvas.classList.remove("on");
    var hidden = host.querySelectorAll(".dz-hide");
    for (var i = 0; i < hidden.length; i++) hidden[i].classList.remove("dz-hide");
    if (S && S.host === host) S.live = false;
  }


  /* ---- going in ------------------------------------------------------
     The canvas takes the image's exact place on screen, so the
     handover is invisible; from then on the canvas is the image. */
  function natural(m) {
    return m.tagName === "VIDEO"
      ? { w: m.videoWidth, h: m.videoHeight }
      : { w: m.naturalWidth, h: m.naturalHeight };
  }

  function begin() {
    if (!S || S.closing) return false;
    if (S.live) return true;
    var m = S.media, nat = natural(m);
    if (!nat.w || !nat.h) return false;            // not loaded yet
    var r = m.getBoundingClientRect();
    if (!r.width || !r.height) return false;

    var k = Math.min(r.width / nat.w, r.height / nat.h);
    var w = nat.w * k, h = nat.h * k;
    S.nat  = nat;
    S.base = { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w: w, h: h };
    S.cur  = copy(S.base);
    S.tgt  = copy(S.base);
    S.max  = Math.max(1, DEEP.MAX_PX * nat.w / w);

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.canvas.width  = Math.round(window.innerWidth * dpr);
    S.canvas.height = Math.round(window.innerHeight * dpr);
    S.canvas.style.width  = window.innerWidth + "px";
    S.canvas.style.height = window.innerHeight + "px";
    S.dpr = dpr;

    S.canvas.classList.add("on");
    m.classList.add("dz-hide");
    S.live = true;
    S.last = 0;
    requestAnimationFrame(tick);
    return true;
  }

  // Keep the image covering the screen once larger than it, and on
  // screen while smaller.
  function hold(T) {
    var vw = window.innerWidth, vh = window.innerHeight;
    T.x = T.w <= vw ? clamp(T.x, 0, vw - T.w) : clamp(T.x, vw - T.w, 0);
    T.y = T.h <= vh ? clamp(T.y, 0, vh - T.h) : clamp(T.y, vh - T.h, 0);
  }

  function zoomAt(f, cx, cy) {
    if (!begin()) return;
    var T = S.tgt, B = S.base;
    var w = clamp(T.w * f, B.w, B.w * S.max);
    var g = w / T.w;
    T.x = cx - (cx - T.x) * g;
    T.y = cy - (cy - T.y) * g;
    T.w = w;
    T.h = T.h * g;
    if (w <= B.w * 1.0001) { S.tgt = copy(B); return; }
    hold(T);
  }

  function pan(dx, dy) {
    if (!S || !S.live) return;
    S.tgt.x += dx;
    S.tgt.y += dy;
    hold(S.tgt);
  }

  function whole() {
    if (S && S.live) S.tgt = copy(S.base);
  }


  /* ---- drawing ---------------------------------------------------------
     Smooth while the image is still an image; the file's own pixels
     fade in over it as they grow, until they are all that is left. */
  function paint() {
    var ctx = S.ctx, m = S.media, nat = S.nat, C = S.cur;
    var vw = window.innerWidth, vh = window.innerHeight;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    // Only the part on screen is drawn.
    var x0 = Math.max(0, C.x), y0 = Math.max(0, C.y);
    var x1 = Math.min(vw, C.x + C.w), y1 = Math.min(vh, C.y + C.h);
    if (x1 <= x0 || y1 <= y0) return;

    var kx = nat.w / C.w, ky = nat.h / C.h;
    var sx = (x0 - C.x) * kx, sy = (y0 - C.y) * ky;
    var sw = (x1 - x0) * kx, sh = (y1 - y0) * ky;

    var p = smooth(DEEP.NOISE_FROM, DEEP.NOISE_FULL, C.w / nat.w);

    if (p < 0.999) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = 1;
      ctx.drawImage(m, sx, sy, sw, sh, x0, y0, x1 - x0, y1 - y0);
    }
    if (p > 0.001) {
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = p;
      ctx.drawImage(m, sx, sy, sw, sh, x0, y0, x1 - x0, y1 - y0);
    }
    ctx.globalAlpha = 1;
  }

  function tick(ms) {
    if (!S || !S.live) return;
    var dt = S.last ? Math.min((ms - S.last) / 1000, 0.05) : 0.016;
    S.last = ms;

    var a = 1 - Math.exp(-dt * DEEP.EASE);
    var C = S.cur, T = S.tgt, B = S.base;
    C.x += (T.x - C.x) * a;
    C.y += (T.y - C.y) * a;
    C.w += (T.w - C.w) * a;
    C.h += (T.h - C.h) * a;
    paint();

    // Back at the whole image: hand it back to the page.
    if (!S.closing && T.w === B.w &&
        Math.abs(C.w - B.w) < 0.5 && Math.abs(C.x - B.x) < 0.5 && Math.abs(C.y - B.y) < 0.5) {
      S.canvas.classList.remove("on");
      S.media.classList.remove("dz-hide");
      S.live = false;
      return;
    }
    requestAnimationFrame(tick);
  }


  /* ---- hands ------------------------------------------------------------ */
  hosts.forEach(function (host) {

    new MutationObserver(function () {
      var open = host.classList.contains("on");
      if (open && (!S || S.host !== host || S.closing)) arm(host);
      else if (!open && S && S.host === host && !S.closing) disarm(host);
    }).observe(host, { attributes: true, attributeFilter: ["class"] });

    host.addEventListener("wheel", function (e) {
      if (!S || S.host !== host || S.closing) return;   // words still scroll
      e.preventDefault();
      e.stopPropagation();
      var d = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 600 : 1);
      zoomAt(Math.exp(d * 0.0022), e.clientX, e.clientY);   // scroll down = in, as on the sphere
    }, { passive: false });

    var pts = {};
    var g = null;

    function keys() { return Object.keys(pts); }
    function apart() { var k = keys(); return Math.hypot(pts[k[0]].x - pts[k[1]].x, pts[k[0]].y - pts[k[1]].y); }
    function mid() { var k = keys(); return { x: (pts[k[0]].x + pts[k[1]].x) / 2, y: (pts[k[0]].y + pts[k[1]].y) / 2 }; }

    host.addEventListener("pointerdown", function (e) {
      if (!S || S.host !== host || S.closing) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (keys().length === 1) g = { x0: e.clientX, y0: e.clientY, moved: false };
      if (keys().length === 2) {
        g = g || {};
        g.moved = true;
        g.pinch = apart();
        g.mid = mid();
      }
    });

    host.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId] || !S || S.host !== host) return;
      var prev = pts[e.pointerId];
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };

      if (keys().length === 2 && g && g.pinch) {
        var d = apart(), m = mid();
        zoomAt(d / g.pinch, m.x, m.y);
        if (S.live) pan(m.x - g.mid.x, m.y - g.mid.y);
        g.pinch = d;
        g.mid = m;
        return;
      }
      if (keys().length === 1 && g) {
        if (Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) > 6) g.moved = true;
        if (g.moved && S.live) pan(e.clientX - prev.x, e.clientY - prev.y);
      }
    });

    function end(e) {
      delete pts[e.pointerId];
      if (!keys().length) {
        if (g && g.moved) quiet = Date.now();
        g = null;
      } else if (g) {
        g.pinch = null;
      }
    }
    host.addEventListener("pointerup", end);
    host.addEventListener("pointercancel", end);
  });

  // Runs before the page's own click handlers. A click that ends a
  // drag does nothing; a click while inside returns to the whole
  // image instead of closing it.
  window.addEventListener("click", function (e) {
    if (!S || S.closing || !S.host.contains(e.target)) return;
    if (Date.now() - quiet < 400) { e.stopPropagation(); e.preventDefault(); return; }
    if (S.live) { e.stopPropagation(); e.preventDefault(); whole(); }
  }, true);

  window.addEventListener("resize", function () {
    if (S && S.live) reset(S.host);
  });
})();
