/* ============================================================
   cursor.js — the drawn circle that follows the pointer.
   The only JavaScript on this site. ~45 lines. Read all of it.

   How it works:
   1. If this script runs, it adds class "has-cursor" to <html>.
      Only then does the CSS hide the real cursor. If JS fails
      or is disabled, visitors keep their normal cursor.
   2. On touch devices (no pointer), it does nothing at all.
   3. On mousemove, the #cursor element is moved to the pointer,
      and its image is rotated toward the direction of travel.
   ============================================================ */

(function () {
  // Touch screens have no cursor. Do nothing there.
  if (window.matchMedia("(pointer: coarse)").matches) return;

  var el = document.getElementById("cursor");
  if (!el) return;
  var img = el.firstElementChild;

  // Real cursor is hidden only now that we know we can replace it.
  document.documentElement.classList.add("has-cursor");

  var lastX = 0, lastY = 0;   // previous pointer position
  var angle = 0;              // current rotation, kept continuous

  /* ---- SPEED -> LIGHT MAPPING --------------------------------
     The circle's tone responds to how the visitor moves.

     false = stillness brightens, speed darkens.
             Light rewards dwelling. (The archive's position.)
     true  = speed brightens, stillness stays dark.
             Light rewards velocity. (The spectacle mapping.)

     Flip the boolean, refresh, judge with your eyes.          */
  var SPEED_BRIGHTENS = false;

  var speed = 0;              // smoothed px-per-event, decays when idle
  var idleTimer = null;

  function applyTone() {
    // speed ~0..40px maps to 0..1. EMA above keeps it soft.
    var v = Math.min(speed / 40, 1);
    if (!SPEED_BRIGHTENS) v = 1 - v;
    // invert(0) = icon as drawn (dark). invert(1) = fully light.
    img.style.filter = "invert(" + v.toFixed(2) + ")";
  }

  document.addEventListener("mousemove", function (e) {
    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    // Exponential moving average: each event nudges the smoothed
    // speed 15% toward the instantaneous one. No flicker.
    speed += (Math.hypot(dx, dy) - speed) * 0.15;
    applyTone();

    // When movement stops, mousemove stops firing — so a short
    // timer returns the tone to its resting state. The CSS
    // transition (style.css) makes the return a slow fade.
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      speed = 0;
      applyTone();
    }, 120);

    // Follow the pointer. (position:fixed + clientX/Y means this
    // stays correct while the page scrolls.)
    el.style.transform = "translate(" + e.clientX + "px, " + e.clientY + "px)";

    // Rotate toward direction of travel — but only for real
    // movement; tiny jitters (< 3px) don't steer the circle.
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      var target = Math.atan2(dy, dx) * 180 / Math.PI;

      // Shortest-path fix: without this, crossing from 179° to
      // -179° would animate the long way round — a visible spin
      // glitch the original CodePen has.
      var diff = target - (angle % 360);
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      angle += diff;

      img.style.transform = "rotate(" + angle + "deg)";
    }
  });

  // Pointer leaves the window: park the circle offscreen.
  document.addEventListener("mouseleave", function () {
    el.style.transform = "translate(-999px, -999px)";
  });
})();
