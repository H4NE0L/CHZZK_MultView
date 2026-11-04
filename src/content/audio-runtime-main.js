"use strict";
(() => {
  // src/content/audio-runtime-main.js
  (() => {
    if (window.top === window || globalThis.__CZAudioRuntime) return;
    const contexts = [];
    let sequence = 0;
    const trace = [], mediaIds = /* @__PURE__ */ new WeakMap();
    let mediaSequence = 0;
    let traceInstalled = false;
    const tracing = () => document.documentElement?.getAttribute("data-cz-playback-trace") === "true";
    function record(kind, element, stack = "", target = null) {
      if (!tracing() || !(element instanceof HTMLMediaElement)) return;
      if (!mediaIds.has(element)) mediaIds.set(element, ++mediaSequence);
      trace.push({ time: Date.now(), kind, elementId: mediaIds.get(element), tag: element.tagName.toLowerCase(), paused: element.paused, ended: element.ended, muted: element.muted, volume: element.volume, currentTime: element.currentTime, readyState: element.readyState, visibility: document.visibilityState, stack, target: typeof target === "number" && Number.isFinite(target) ? target : null });
      if (trace.length > 96) trace.shift();
    }
    function installTrace() {
      if (traceInstalled || !tracing()) return;
      traceInstalled = true;
      const stack = () => String(new Error().stack || "").split("\n").slice(3, 8).join("\n").replace(/(?:blob:)?(?:https?|chrome-extension):\/\/[^\s)]+/g, "[source]").slice(0, 1200);
      for (const method of ["play", "pause", "load", "fastSeek"]) {
        const native = HTMLMediaElement.prototype[method];
        if (typeof native !== "function") continue;
        HTMLMediaElement.prototype[method] = function(...args) {
          try {
            if (tracing()) record("call:" + method, this, stack(), method === "fastSeek" ? args[0] : null);
          } catch (_) {
          }
          return Reflect.apply(native, this, args);
        };
      }
      const position = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
      if (position?.set && position.configurable) {
        const native = position.set;
        Object.defineProperty(HTMLMediaElement.prototype, "currentTime", { ...position, set(value) {
          try {
            record("call:currentTime", this, stack(), value);
          } catch (_) {
          }
          return Reflect.apply(native, this, [value]);
        } });
      }
      for (const type of ["play", "playing", "pause", "waiting", "stalled", "emptied", "ended", "error", "seeking", "seeked", "ratechange"]) document.addEventListener(type, (event) => {
        try {
          record("event:" + type, event.target);
        } catch (_) {
        }
      }, true);
      document.addEventListener("visibilitychange", () => {
        if (tracing()) {
          trace.push({ time: Date.now(), kind: "visibility", visibility: document.visibilityState });
          if (trace.length > 96) trace.shift();
        }
      });
    }
    document.addEventListener("cz-playback-trace-enable", installTrace);
    const snapshot = () => ({ available: true, playbackTrace: { revision: "media-calls-1", enabled: tracing(), entries: trace.map((entry) => ({ ...entry })) }, contexts: contexts.map((entry) => {
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
