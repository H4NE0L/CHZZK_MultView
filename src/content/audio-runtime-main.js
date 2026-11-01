"use strict";
(() => {
  // src/content/audio-runtime-main.js
  (() => {
    if (window.top === window || globalThis.__CZAudioRuntime) return;
    const contexts = [];
    let sequence = 0;
    const snapshot = () => ({ available: true, contexts: contexts.map((entry) => {
      const context = entry.ref.deref();
      return context ? { id: entry.id, state: context.state, currentTime: context.currentTime, sampleRate: context.sampleRate, baseLatency: context.baseLatency ?? null, outputLatency: context.outputLatency ?? null } : null;
    }).filter(Boolean) });
    async function close() {
      const active = contexts.map((entry) => entry.ref.deref()).filter((context) => context && context.state !== "closed");
      let timer;
      await Promise.race([Promise.allSettled(active.map((context) => {
        try {
          return context.close();
        } catch (error) {
          return Promise.reject(error);
        }
      })), new Promise((resolve) => {
        timer = setTimeout(resolve, 250);
      })]);
      clearTimeout(timer);
      return { observed: active.length, states: snapshot().contexts };
    }
    globalThis.__CZAudioRuntime = { snapshot, close };
    for (const key of ["AudioContext", "webkitAudioContext"]) {
      const Native = globalThis[key];
      if (typeof Native !== "function") continue;
      globalThis[key] = new Proxy(Native, { construct(target, args, newTarget) {
        const context = Reflect.construct(target, args, newTarget);
        contexts.push({ id: ++sequence, ref: new WeakRef(context) });
        if (contexts.length > 16) contexts.shift();
        return context;
      } });
    }
  })();
})();
