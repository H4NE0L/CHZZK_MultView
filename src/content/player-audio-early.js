"use strict";
(() => {
  // src/content/player-audio-early.js
  (() => {
    if (globalThis.CZPlayerAudioEarly) return;
    const gate = { volumechange: null, storage: null };
    globalThis.CZPlayerAudioEarly = gate;
    for (const type of ["volumechange", "storage"]) window.addEventListener(type, (event) => gate[type]?.(event), true);
    window.addEventListener("pagehide", () => {
      gate.volumechange = null;
      gate.storage = null;
    }, { once: true });
  })();
})();
