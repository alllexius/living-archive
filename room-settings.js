/* ============================================================
   THE ROOM — SETTINGS

   The only file to change when tuning the room.

   - Change a number after the colon. Keep the comma at the
     end of the line.
   - true / false: write one or the other, no quotes.
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

  /* ---- LIGHT ---- */

  // Brightness (Value) · 0.02 – 1 · original 0.6
  // How bright the screen glows, as Value: 1 = full, 0.5 =
  // middle grey. Lower lets the screen recede so the room
  // carries the light, not the screen. Below about 0.15 the
  // color steps get coarse.
  brightness: 0.6,

  // Color limit · 0 – 0.6 · original 0.22
  // Most color the screen may carry. 0 = only white light. 1
  // would be one pure color. Lower = more muted, but less able
  // to cancel a colored room.
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

  // Grey tolerance · 0 – 0.2 · original 0.04
  // How much color may remain in the room and still count as
  // grey. 0 = perfectly grey (rarely reachable). Higher lets the
  // room begin sooner.
  greyTolerance: 0.04,

  // Recheck (seconds) · 1 – 10 · original 2.5
  // While conditions are not met, how often the page measures
  // the room again. Each measurement is one flash of light, then
  // dark.
  recheckSeconds: 2.5,

  /* ---- HOLDING ---- */

  // Correction speed · 0 – 0.05 · original 0.008
  // How quickly the page corrects toward grey while the camera
  // watches. 0 = never corrects after the first measurement. Too
  // high can make the color waver.
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
  // nothing. Always within the color limit.
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
  // true = visitors can press the up and down arrow keys to
  // adjust brightness for their own screen and room. false =
  // brightness is fixed at the value above.
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
  muteMet: "Room color muted",
  muteWeak: "Room color partly muted",
  muteUnknown: "Room color",
  met: "Held.",
  keysHint: "↑ ↓ brightness",
  ended: "The camera has stopped.",
  mailSubject: "The Room — alexius.studio",
};
