/* ============================================================
   THE ROOM — SETTINGS

   The only file to change when tuning the room.

   - Change a number after the colon. Keep the comma at the
     end of the line.
   - true / false: write one or the other, no quotes.
   - Choices ("red" or "grey"): keep the quote marks.
   - Words: change the text between the quote marks only.

   Each number has a range. A value outside it is pulled to
   the nearest end. A value the page can’t read falls back to
   the original. If the whole file can’t be read (a missing
   comma or quote mark), the room uses every original value,
   and the tuning panel says so.

   To tune by eye, in the dark: open room-color.html?tune
   Press T to show or hide the tuning panel. Its “Copy
   settings” button copies a complete new version of this
   file, ready to paste over everything here.
   ============================================================ */

window.ROOM_SETTINGS = {

  /* ---- COLOR ---- */

  // Mode · "red" or "grey" · original "red"
  // "red" = the room is held in a faded, wandering
  // long-wavelength light. "grey" = the room is held at grey.
  roomMode: "red",

  // Room hue (degrees) · -40 – 40 · original 6
  // Red mode. The center of the room’s color. 0 = red. Negative
  // leans toward crimson and magenta. Positive leans toward
  // orange.
  roomHue: 6,

  // Room color strength · 0 – 0.95 · original 0.75
  // Red mode. How much color the room itself carries, as the
  // camera sees it. 0 = grey. Low values = a faded red the eye
  // may not name.
  roomColor: 0.75,

  // Green limit · 0 – 1 · original 0.35
  // Red mode. Most green the screen may emit, as a fraction of
  // its red. Lower = green surfaces fall darker.
  greenLimit: 0.35,

  // Blue limit · 0 – 1 · original 0.3
  // Red mode. Most blue the screen may emit, as a fraction of
  // its red. Lower protects dark adaptation (rods respond to
  // short wavelengths, barely to long ones).
  blueLimit: 0.3,

  // Hue wander (degrees) · 0 – 40 · original 12
  // Red mode. How far the hue may wander either side of Room
  // hue.
  wanderHue: 12,

  // Color wander · 0 – 0.4 · original 0.15
  // Red mode. How far the color strength may wander either side
  // of Room color strength. Wide = the room passes near grey at
  // times.
  wanderColor: 0.15,

  // Wander speed (degrees / minute) · 0 – 30 · original 3
  // Red mode. The fastest the hue may move. Slow enough, and the
  // change cannot be followed, only found. 0 = no wander.
  wanderSpeed: 3,

  /* ---- LIGHT ---- */

  // Brightness (Value) · 0.02 – 1 · original 0.6
  // How bright the screen glows, as Value: 1 = full, 0.5 =
  // middle grey. Lower lets the screen recede so the room
  // carries the light, not the screen. Below about 0.15 the
  // color steps get coarse.
  brightness: 0.6,

  // Color limit · 0 – 0.6 · original 0.22
  // Grey mode. Most color the screen may carry. 0 = only white
  // light. 1 would be one pure color. Lower = more muted, but
  // less able to cancel a colored room.
  colorLimit: 0.22,

  // Color fade (seconds) · 0 – 10 · original 0.6
  // How long each change of the screen’s color takes to arrive.
  // Longer = slower, more continuous drift.
  colorFadeSeconds: 0.6,

  /* ---- ROOM ---- */

  // Darkness needed · 0.2 – 0.95 · original 0.6
  // How much of the light on the visitor must come from the
  // screen before the room begins. 0.6 = 60%. Higher asks for a
  // darker room.
  darknessNeeded: 0.6,

  // Target tolerance · 0 – 0.3 · original 0.06
  // How far the room may be from its target color and still
  // count as reached. 0 = exact (rarely reachable). Higher lets
  // the room begin sooner.
  targetTolerance: 0.06,

  // Recheck (seconds) · 1 – 10 · original 2.5
  // While conditions are not met, how often the page measures
  // the room again. Each measurement is one flash of light, then
  // dark.
  recheckSeconds: 2.5,

  /* ---- HOLDING ---- */

  // Correction speed · 0 – 0.05 · original 0.008
  // How quickly the page corrects toward the target while the
  // camera watches. 0 = never corrects after the first
  // measurement. Too high can make the color waver.
  correctionSpeed: 0.008,

  // Correction range · 0 – 0.3 · original 0.12
  // How far corrections may move the color away from the first
  // measurement.
  correctionRange: 0.12,

  /* ---- MOVEMENT ---- */

  // Movement threshold · 1 – 20 · original 5
  // How much movement it takes to shift the color. Lower = a
  // hand’s shadow is enough. Higher = only large movement.
  movementThreshold: 5,

  // Movement strength · 0 – 0.3 · original 0.1
  // How far movement can shift the color. 0 = movement changes
  // nothing. Always within the limits above.
  movementStrength: 0.2,

  // Movement rate · 0 – 0.05 · original 0.012
  // How fast the color answers movement while it happens.
  movementRate: 0.03,

  // Movement fade (seconds) · 1 – 120 · original 17
  // How long the shift from a movement takes to fade once the
  // room is still again.
  movementFadeSeconds: 12,

  /* ---- PAGE ---- */

  // Panel fade (seconds) · 1 – 30 · original 3
  // After this much stillness, the panel and pointer disappear.
  panelFadeSeconds: 3,

  // Visitor brightness keys · true or false · original true
  // true = the up and down arrow keys adjust brightness, for a
  // visitor who looks for it. Nothing on the page invites it
  // unless the keysHint words below are filled in. false =
  // brightness is fixed.
  visitorBrightnessKeys: true,
};


/* ---- WORDS the visitor reads ---- */
window.ROOM_WORDS = {
  noCamera: "No camera was found, or access was refused.",
  noSecure: "The camera needs this page to be opened over https.",
  balanceLock: "Camera color held",
  balanceTemp: "This camera balances color by itself. The room’s color is estimated.",
  balanceFree: "This camera balances color by itself. The room’s color cannot be read.",
  blind: "The camera sees almost nothing. Uncover it, or sit facing the screen.",
  muchTooBright: "Please turn off the lights in the room, or close the curtains.",
  tooBright: "Please lower the light in the room a little more.",
  tooColored: "The room’s own light is too colored to mute. Please lower it further.",
  tooStrong: "The room’s own light is too strong to color. Please lower it further.",
  muteMet: "Room color muted",
  muteWeak: "Room color partly muted",
  muteUnknown: "Room color",
  targetMet: "Room color held",
  targetWeak: "Room color partly held",
  met: "Held.",
  keysHint: "",
  ended: "The camera has stopped.",
  mailSubject: "The Room — alexius.studio",
};
