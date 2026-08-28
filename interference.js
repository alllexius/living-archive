/* ============================================================
   interference.js
   Loads AFTER cursor.js

     1. THE FIELD      WebGL background
     2. THE VEIL       inversion + center nav
     3. BLOOM          links advance on hold, retreat on release
     4. ZOOM           an image surfaces over a withdrawn page
     5. THE STAGE      one entry at a time
     6. IMAGES         right-click off
     7. THE ADDRESS    assembled at runtime

   Nothing here touches cursor.js. 
   ============================================================ */

(function () {
  "use strict";

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE  = window.matchMedia("(pointer: coarse)").matches;
  var FIELD = { hold: function () {}, release: function () {} };
  var ZOOM = {
    open:   function () {},
    close:  function () {},
    isOpen: function () { return false; }
  };


  /* ==========================================================
     1. THE FIELD

     Four circular ramps, each a tent (black > light > black)
     over distance from its own center.
     
     ========================================================== */
  (function field() {
    var canvas = document.getElementById("field-canvas");
    if (!canvas) return;

    // preserveDrawingBuffer so the last frame survives while the
    // loop is held — without it the canvas may clear to black the
    var opts = { antialias: false, alpha: false, preserveDrawingBuffer: true };
    var gl = canvas.getContext("webgl", opts)
          || canvas.getContext("experimental-webgl", opts);
    if (!gl) { canvas.style.display = "none"; return; }   // body keeps --eigengrau

    var VERT =
      "attribute vec2 p;" +
      "void main(){ gl_Position = vec4(p, 0.0, 1.0); }";

    var FRAG = [
      "precision highp float;",
      "uniform vec2  u_res;",
      "uniform float u_t;",
      "uniform vec2  u_ptr;",

      // Ordered 4x4 Bayer, formula form (no array indexing in WebGL1).
      "float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }",
      "float bayer4(vec2 a){ return bayer2(a * 0.5) * 0.25 + bayer2(a); }",

      // One circular ramp: tent over distance, smoothed twice so
      // the ring reads as blurred rather than drawn.
      "float ramp(vec2 uv, vec2 c, float scale, float phase){",
      "  float d = length(uv - c) * scale;",
      "  float t = 1.0 - abs(fract(d + phase) * 2.0 - 1.0);",
      "  t = smoothstep(0.0, 1.0, t);",
      "  return smoothstep(0.0, 1.0, t);",
      "}",

      "void main(){",
      "  vec2 uv = gl_FragCoord.xy / u_res;",
      "  float aspect = u_res.x / u_res.y;",
      "  uv.x *= aspect;",

      "  vec2 c1 = vec2(0.26 * aspect, 0.68);",
      "  vec2 c2 = vec2(0.71 * aspect, 0.24);",
      "  vec2 c3 = vec2(0.12 * aspect, 0.19);",
      "  vec2 c4 = vec2(0.55 * aspect, 0.86);",

      "  float r1 = ramp(uv, c1, 1.7,  u_t * 0.013);",
      "  float r2 = ramp(uv, c2, 2.4, -u_t * 0.0071);",
      "  float r3 = ramp(uv, c3, 1.3,  u_t * 0.0193);",
      "  float r4 = ramp(uv, c4, 3.1, -u_t * 0.0041);",

      "  float rp = ramp(uv, vec2(u_ptr.x * aspect, u_ptr.y), 1.15, u_t * 0.006);",

      "  float v = mix(0.55, 1.0, r1);",
      "  v *= mix(0.55, 1.0, r2);",
      "  v *= mix(0.55, 1.0, r3);",
      "  v *= mix(0.60, 1.0, r4);",
      "  v *= mix(0.58, 1.0, rp);",

      "  vec3 base  = vec3(0.0863, 0.0863, 0.1137);",  // #16161D
      "  vec3 field = base + v * 0.0253;",

      "  field += (bayer4(gl_FragCoord.xy) - 0.5) / 255.0;",
      "  gl_FragColor = vec4(field, 1.0);",
      "}"
    ].join("\n");

    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    var vs = shader(gl.VERTEX_SHADER, VERT);
    var fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { canvas.style.display = "none"; return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, "u_res");
    var uT   = gl.getUniformLocation(prog, "u_t");
    var uPtr = gl.getUniformLocation(prog, "u_ptr");

    function resize() {
      // DPR capped at 2. The dither handles the rest.
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = Math.round(window.innerWidth  * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();

    // Pointer, heavily smoothed. On touch it drifts on its own
    // so the field never sits perfectly still.
    var ptrX = 0.5, ptrY = 0.5, tgtX = 0.5, tgtY = 0.5;
    if (!COARSE) {
      document.addEventListener("mousemove", function (e) {
        tgtX = e.clientX / window.innerWidth;
        tgtY = 1.0 - e.clientY / window.innerHeight;
      }, { passive: true });
    }

    var held = false;
    FIELD.hold    = function () { held = true; };
    FIELD.release = function () { held = false; };

    function draw(ms) {
      // Held: skip the draw entirely, keep the loop alive. Phase
      // advances underneath, but at 0.0041–0.0193 Hz two seconds
      // of drift is nothing you could see.
      if (held) { requestAnimationFrame(draw); return; }

      var t = ms * 0.001;

      if (COARSE) {
        tgtX = 0.5 + Math.sin(t * 0.017) * 0.28;
        tgtY = 0.5 + Math.cos(t * 0.011) * 0.24;
      }
      ptrX += (tgtX - ptrX) * 0.02;   // slow enough to feel like weather
      ptrY += (tgtY - ptrY) * 0.02;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uT, REDUCED ? 0.0 : t);   // frozen frame if asked
      gl.uniform2f(uPtr, ptrX, ptrY);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  })();


  /* ==========================================================
     2. THE VEIL

     One click: the page inverts, opening as a circle from the
     button, and the nav rises from the centre. Click again and
     the circle closes back into the button.

     The state is stored, so it carries across pages. On arrival
     it is applied with transitions off — otherwise every page
     load would replay the two seconds.
     ========================================================== */
  (function veil() {
    var btn  = document.getElementById("veil-btn");
    var vail = document.getElementById("invert-veil");
    var nav  = document.getElementById("centre-nav");
    if (!btn || !vail) return;

    // No persistence. Carrying the state across pages desynced the
    // button: the nav was force-closed on arrival while `on` stayed
    // true, so the next click reverted the page instead of opening
    // the menu. Every page opens in the default state.
    var on = false;

    function set(next) {
      on = next;
      vail.classList.toggle("on", on);
      btn.classList.toggle("is-inverted", on);
      btn.setAttribute("aria-expanded", on ? "true" : "false");
      if (nav) nav.classList.toggle("open", on);
      // The page withdraws while the nav is open rather than being
      // covered by it — see interference.css, body.nav-open.
      document.body.classList.toggle("nav-open", on);
    }

    btn.addEventListener("click", function () {
      ZOOM.close();          // the nav opens where the zoom sits
      FIELD.hold();
      setTimeout(FIELD.release, 2150);   // transition is 2000ms
      set(!on);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && on) set(false);
    });

  })();


  /* ==========================================================
     3. BLOOM

     Progress runs 0 -> 1 over 4.5s while the pointer is held,
     and back to 0 over 1.8s once it leaves. Nothing here is
     permanent, and nothing reflows: text-shadow and filter both
     paint outside the box without moving a single line.

     Each link carries its own progress. Crossing from one to
     another leaves the first retreating on its own 1.8s curve
     while the second advances on its 4.5s one — they overlap,
     the way two afterimages would.

     This was a single shared counter, which produced exactly the
     wrong thing: the first snapped to zero on contact with the
     second, and handed over its accumulated brightness, so the
     second appeared to arrive almost fully lit.

     Your existing CSS afterimage — colour in at 0.15s, out over
     4s — still runs underneath, on different properties. The
     bloom is what happens during contact; the afterimage is
     what remains after it.
     ========================================================== */
  (function bloom() {
    if (REDUCED || COARSE) return;

    var ATTACK  = 4500;
    var RELEASE = 1800;
    var MAX_DT  = 50;   // A backgrounded tab hands back a gap of
                        // minutes on return. Without this cap the
                        // bloom would snap instead of resume.

    // Matches the selector in interference.css. It did not before:
    // .fn-entry a was styled for bloom but never wired to it.
    var links = document.querySelectorAll(".prose a, .fn-entry a, a.bloom");
    if (!links.length) return;

    var active = [];      // [{ el, p, held }] — only what is moving
    var running = false;
    var last = 0;

    // One record per element, created on first contact. Re-entering
    // something still retreating finds its record and picks up from
    // where it got to, rather than restarting from dark.
    function stateFor(el) {
      for (var i = 0; i < active.length; i++) {
        if (active[i].el === el) return active[i];
      }
      var s = { el: el, p: 0, held: false };
      active.push(s);
      return s;
    }

    function clear(el) {
      el.style.textShadow = "";
      el.style.filter = "";
      el.style.zIndex = "";
    }

    function paint(el, p) {
      if (p <= 0.001) { clear(el); return; }
      var lit = "232,230,223";                       // --lit, as rgb
      el.style.textShadow =
        "0 0 " + (p * 9).toFixed(1)  + "px rgba(" + lit + "," + (p * 0.85).toFixed(3) + ")," +
        "0 0 " + (p * 34).toFixed(1) + "px rgba(" + lit + "," + (p * 0.50).toFixed(3) + ")," +
        "0 0 " + (p * 88).toFixed(1) + "px rgba(" + lit + "," + (p * 0.30).toFixed(3) + ")";
      el.style.filter = "blur(" + (p * p * 2.1).toFixed(2) + "px) " +
                        "brightness(" + (1 + p * 1.35).toFixed(2) + ")";
      el.style.zIndex = "5";
    }

    function tick(ms) {
      var dt = last ? Math.min(ms - last, MAX_DT) : 16;
      last = ms;

      // Backwards: entries are dropped from the middle as they
      // finish retreating.
      for (var i = active.length - 1; i >= 0; i--) {
        var s = active[i];
        s.p = s.held
          ? Math.min(1, s.p + dt / ATTACK)
          : Math.max(0, s.p - dt / RELEASE);
        paint(s.el, s.p);
        if (!s.held && s.p <= 0) active.splice(i, 1);
      }

      if (active.length) requestAnimationFrame(tick);
      else running = false;      // nothing moving, stop the loop
    }

    function run() {
      if (running) return;
      running = true;
      last = 0;
      requestAnimationFrame(tick);
    }

    Array.prototype.forEach.call(links, function (a) {
      a.addEventListener("mouseenter", function () {
        stateFor(a).held = true;
        run();
      });
      a.addEventListener("mouseleave", function () {
        stateFor(a).held = false;
        run();
      });
    });
  })();


  /* ==========================================================
     4. ZOOM

     A clone of the image, held over a withdrawn page. Three
     seconds in, three seconds out, opacity and scale together —
     so it does not arrive, it surfaces.

     A clone rather than the original: moving the real element
     would tear it out of the stage's layout and the entry would
     collapse behind it. The clone is inert, and the original
     stays exactly where it was, receding.

     Nothing is emptied until the fade has finished. Clearing on
     the way out would make the image vanish instead of recede.
     ========================================================== */
  (function zoom() {
    var layer = document.createElement("div");
    layer.id = "zoom-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    var open = false;
    var timer = null;

    ZOOM.isOpen = function () { return open; };

    ZOOM.open = function (img) {
      if (open || !img) return;
      clearTimeout(timer);

      var clone = img.cloneNode(true);
      clone.removeAttribute("style");   // drop the entry's margin
      layer.innerHTML = "";
      layer.appendChild(clone);

      void layer.offsetWidth;           // force reflow: transition
                                        // must start from the small
                                        // state, not skip to it
      open = true;
      document.body.classList.add("zoom-open");
      layer.classList.add("on");
    };

    ZOOM.close = function () {
      if (!open) return;
      open = false;
      document.body.classList.remove("zoom-open");
      layer.classList.remove("on");
      timer = setTimeout(function () { layer.innerHTML = ""; }, 3200);
    };

    layer.addEventListener("click", function () { ZOOM.close(); });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) ZOOM.close();
    });

    // Archive figures. Listener sits on the <figure>, not the
    // <img>, so it still fires through the figure::after overlay
    // in style.css if you have kept that.
    var figures = document.querySelectorAll(".study figure");
    Array.prototype.forEach.call(figures, function (fig) {
      var img = fig.querySelector("img");
      if (!img) return;
      fig.addEventListener("click", function (e) {
        if (e.target.closest("a, audio, video")) return;
        ZOOM.open(img);
      });
    });
  })();


  /* ==========================================================
     5. THE STAGE

     One entry held in view. Left half goes back, right half goes
     forward — anywhere on that half, not a narrow strip, so it
     works with a thumb as well as a pointer. Anything that is
     already interactive (a link, a video, an audio player) is
     left alone; a click there does what it was going to do.

     Near an edge on a pointer device, the adjacent entry ghosts
     in at 9% opacity. That is the whole affordance: no arrow, no
     counter, no instruction. The space shows you where it opens.
     ========================================================== */
  (function stage() {
    var stage = document.querySelector(".fn-stage");
    if (!stage) return;

    var entries = Array.prototype.slice.call(stage.querySelectorAll(".fn-entry"));

    // Nothing to hold. Leave the stage inert and the page scrolls.
    if (!entries.length) return;

    // Only now does the stage start hiding things. If this file
    // fails to load or throws before here, .is-live is never set,
    // every entry stays visible, and Field Notes is the scrolling
    // list it was before. Same contract cursor.js makes.
    stage.classList.add("is-live");

    if (entries.length === 1) {
      entries[0].classList.add("current");
      return;
    }

    var i = 0;
    var ghostL = document.createElement("div");
    var ghostR = document.createElement("div");
    ghostL.className = "fn-ghost left";
    ghostR.className = "fn-ghost right";
    ghostL.setAttribute("aria-hidden", "true");
    ghostR.setAttribute("aria-hidden", "true");
    stage.appendChild(ghostL);
    stage.appendChild(ghostR);

    function wrap(n) { return (n + entries.length) % entries.length; }

    // A ghost is a still copy: controls stripped, muted, inert.
    function fillGhost(box, n) {
      box.innerHTML = entries[wrap(n)].innerHTML;
      Array.prototype.forEach.call(box.querySelectorAll("video, audio"), function (m) {
        m.removeAttribute("controls");
        m.muted = true;
        m.removeAttribute("autoplay");
      });
    }

    function show(n) {
      entries.forEach(function (el, k) {
        el.classList.toggle("current", k === n);
        // Stop anything playing in the entry being left behind.
        if (k !== n) {
          Array.prototype.forEach.call(el.querySelectorAll("video, audio"), function (m) {
            if (!m.paused) m.pause();
          });
        }
      });
      i = n;
      fillGhost(ghostL, i - 1);
      fillGhost(ghostR, i + 1);
    }

    function go(step) { show(wrap(i + step)); }

    show(0);

    stage.addEventListener("click", function (e) {
      if (ZOOM.isOpen()) return;
      if (e.target.closest("a, video, audio, button, input, textarea")) return;

      // The image is the zoom target; the margins on either side
      // of it are the navigation. This is the arrangement you
      // described at the start — click either side of the image —
      // which the earlier left-half/right-half split swallowed.
      var img = e.target.closest(".fn-entry img");
      if (img) { ZOOM.open(img); return; }

      var r = stage.getBoundingClientRect();
      go(e.clientX - r.left < r.width / 2 ? -1 : 1);
    });

    if (!COARSE) {
      stage.addEventListener("mousemove", function (e) {
        var r = stage.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width;
        ghostL.classList.toggle("lit", x < 0.22);
        ghostR.classList.toggle("lit", x > 0.78);
      }, { passive: true });

      stage.addEventListener("mouseleave", function () {
        ghostL.classList.remove("lit");
        ghostR.classList.remove("lit");
      });
    }

    // Swipe. 45px threshold, and only when the gesture is more
    // horizontal than vertical.
    var sx = 0, sy = 0;
    stage.addEventListener("touchstart", function (e) {
      sx = e.changedTouches[0].clientX;
      sy = e.changedTouches[0].clientY;
    }, { passive: true });

    stage.addEventListener("touchend", function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    document.addEventListener("keydown", function (e) {
      if (ZOOM.isOpen()) return;   // Escape closes the zoom instead
      if (e.key === "ArrowLeft")  go(-1);
      if (e.key === "ArrowRight") go(1);
    });
  })();


  /* ==========================================================
     6. IMAGES

     Right-click off, drag off. This stops the casual save. It
     does not stop devtools, and nothing does — the file is on
     their machine the moment the page renders. The meta and
     comment in your <head> are what actually carry weight.
     ========================================================== */
  document.addEventListener("contextmenu", function (e) {
    if (e.target.closest("img, video, canvas, figure")) e.preventDefault();
  });

  document.addEventListener("dragstart", function (e) {
    if (e.target.closest("img, video")) e.preventDefault();
  });


  /* ==========================================================
     7. THE ADDRESS

     Assembled at runtime. Nothing in the served file is a valid
     address: both halves are ROT13'd and the @ never appears in
     the source at all, so a regex sweep finds nothing to take.

     ROT13 is its own inverse, so this same function is what you
     use to encode a new address. Run it in the console on the
     string you want, put the result in data-a and data-b.

     Without JS the link stays inert text. That is a real cost,
     and the reason it is acceptable here is that Are.na sits
     directly above it as a second way through.
     ========================================================== */
  (function address() {
    var nodes = document.querySelectorAll(".veiled-mail");
    if (!nodes.length) return;

    function rot13(s) {
      return s.replace(/[a-z]/gi, function (c) {
        var base = c <= "Z" ? 65 : 97;
        return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
      });
    }

    Array.prototype.forEach.call(nodes, function (el) {
      var user = rot13(el.getAttribute("data-a") || "");
      var host = rot13(el.getAttribute("data-b") || "");
      if (!user || !host) return;

      var addr = user + String.fromCharCode(64) + host;
      el.setAttribute("href", "mailto:" + addr);
      el.textContent = addr;
    });
  })();

})();
