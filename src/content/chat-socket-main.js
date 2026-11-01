"use strict";
(() => {
  // src/shared/chat/source-epoch.js
  var own = (object, key) => object && typeof object === "object" ? Object.getOwnPropertyDescriptor(object, key)?.value : void 0;
  function sourceEpoch(message) {
    for (const key of ["messageTime", "messageTimestamp", "msgTime", "createdAt", "createTime", "ctime", "time", "regTime", "timestamp"]) {
      const value = own(message, key);
      if (!["string", "number"].includes(typeof value) || value === "") continue;
      const number = Number(value), generic = ["time", "regTime", "timestamp"].includes(key);
      if (generic && (!Number.isFinite(number) || number < 1e12)) continue;
      const ms = Number.isFinite(number) ? number * (number < 1e11 ? 1e3 : 1) : Date.parse(value);
      if (Number.isFinite(ms) && ms >= 9466848e5 && ms <= Date.now() + 6e4) return ms;
    }
    return null;
  }

  // src/shared/chat/message-content.js
  var own2 = (object, key) => object && typeof object === "object" ? Object.getOwnPropertyDescriptor(object, key)?.value : void 0;
  function imageToken(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? `[[image:${url.origin}${url.pathname}]]` : "";
    } catch (_) {
      return "";
    }
  }
  function sourceContent(value, extras) {
    let text = typeof value === "string" ? value : "";
    if (typeof extras === "string" && extras.length <= 16e3) {
      try {
        extras = JSON.parse(extras);
      } catch (_) {
        extras = null;
      }
    }
    let emojis = own2(extras, "emojis");
    if (typeof emojis === "string" && emojis.length <= 16e3) {
      try {
        emojis = JSON.parse(emojis);
      } catch (_) {
        emojis = null;
      }
    }
    if (emojis && typeof emojis === "object") for (const key of Object.keys(emojis).slice(0, 32)) {
      const token = imageToken(own2(emojis, key));
      if (!token) continue;
      const forms = key.startsWith("{:") ? [key] : [`{:${key}:}`, ...key.startsWith(":") && key.endsWith(":") ? [key] : []];
      for (const form of forms) text = text.split(form).join(token);
    }
    return text;
  }

  // src/shared/chat/source-times.js
  var keyFor = (author, text) => {
    const input = JSON.stringify([String(author).normalize("NFC").replace(/\s+/g, " ").trim(), String(text).normalize("NFC").replace(/\s+/g, " ").trim()]);
    let a = 2166136261, b = 5381;
    for (let i = 0; i < input.length; i++) {
      a = Math.imul(a ^ input.charCodeAt(i), 16777619);
      b = Math.imul(b, 33) ^ input.charCodeAt(i);
    }
    return `${input.length}:${a >>> 0}:${b >>> 0}`;
  };
  var sourceTimes = globalThis.__CZChatSourceTimesV1 ||= /* @__PURE__ */ (() => {
    const entries = /* @__PURE__ */ new Map(), byId = /* @__PURE__ */ new Map(), listeners = /* @__PURE__ */ new Set();
    function add(message) {
      if (!message || typeof message !== "object") return;
      let profile = message.profile;
      if (typeof profile === "string" && profile.length <= 16e3) {
        try {
          profile = JSON.parse(profile);
        } catch (_) {
          return;
        }
      }
      const name = profile?.nickname ?? message.nickname, text = message.content ?? message.msg ?? message.message;
      const time = sourceEpoch(message);
      if (typeof name !== "string" || typeof text !== "string" || !text.trim() || text.length > 16e3 || time === null) return;
      const key = keyFor(name, sourceContent(text, message.extras)), old = entries.get(key);
      entries.set(key, old && old !== time ? -1 : time);
      while (entries.size > 2048) entries.delete(entries.keys().next().value);
      const id = message.messageId ?? message.msgId ?? message.id;
      if (["string", "number"].includes(typeof id) && String(id).length <= 160) {
        byId.set(String(id), { key, author: keyFor(name, ""), time });
        while (byId.size > 2048) byId.delete(byId.keys().next().value);
      }
      for (const listener of listeners) {
        try {
          listener({ key, id: typeof id === "string" || typeof id === "number" ? String(id) : null });
        } catch (_) {
        }
      }
    }
    return { key: keyFor, subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, add, lookup(name, text, id) {
      const key = keyFor(name, text);
      if (id) {
        const entry = byId.get(String(id));
        return entry?.author === keyFor(name, "") ? entry.time : null;
      }
      const time = entries.get(key);
      return time > 0 ? time : null;
    }, clear() {
      entries.clear();
      byId.clear();
    }, get size() {
      return entries.size;
    } };
  })();

  // src/content/chat-socket-main.js
  (() => {
    if (!["1", "chat"].includes(new URLSearchParams(location.search).get("multiview")) || window.__CZChatSocketReaderV1 || typeof WebSocket !== "function") return;
    window.__CZChatSocketReaderV1 = true;
    const Native = window.WebSocket, sockets = /* @__PURE__ */ new Map();
    let disposed = false, enabled = new URLSearchParams(location.search).get("cz_timestamps") === "1";
    let packets = 0, statsTimer = null;
    function report() {
      if (!statsTimer) statsTimer = setTimeout(() => {
        statsTimer = null;
        document.documentElement?.setAttribute("data-cz-socket-time-state", JSON.stringify({ revision: "20261102-1", enabled, sockets: sockets.size, packets, indexed: sourceTimes.size }));
      }, 250);
    }
    function receive(event) {
      if (disposed || !enabled || typeof event.data !== "string" || event.data.length > 1024 * 1024) return;
      packets++;
      report();
      let packet;
      try {
        packet = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      let body = packet?.bdy ?? packet?.body;
      if (typeof body === "string") {
        if (body.length > 1024 * 1024) return;
        try {
          body = JSON.parse(body);
        } catch (_) {
          return;
        }
      }
      const messages = Array.isArray(body) ? body : body?.messageList ?? body?.messages ?? (body?.profile ? [body] : []);
      if (!Array.isArray(messages)) return;
      messages.slice(-200).forEach(sourceTimes.add);
    }
    const ProxySocket = new Proxy(Native, { construct(target, args, newTarget) {
      const socket = Reflect.construct(target, args, newTarget);
      try {
        const url = new URL(String(args[0]), location.href);
        if (!disposed && url.protocol === "wss:" && /(^|\.)chat\.naver\.com$/.test(url.hostname)) {
          const close = () => {
            socket.removeEventListener("message", receive);
            socket.removeEventListener("close", close);
            sockets.delete(socket);
          };
          sockets.set(socket, close);
          if (enabled) socket.addEventListener("message", receive);
          socket.addEventListener("close", close);
        }
      } catch (_) {
      }
      return socket;
    } });
    function configure() {
      enabled = !disposed && (document.documentElement?.hasAttribute("data-cz-timestamps-enabled") ? document.documentElement.getAttribute("data-cz-timestamps-enabled") === "true" : new URLSearchParams(location.search).get("cz_timestamps") === "1");
      for (const socket of sockets.keys()) {
        socket.removeEventListener("message", receive);
        if (enabled) socket.addEventListener("message", receive);
      }
      if (!enabled) sourceTimes.clear();
      report();
    }
    document.addEventListener("cz-chat-timestamps-config", configure);
    configure();
    window.WebSocket = ProxySocket;
    window.addEventListener("pagehide", () => {
      disposed = true;
      clearTimeout(statsTimer);
      statsTimer = null;
      document.removeEventListener("cz-chat-timestamps-config", configure);
      for (const close of sockets.values()) close();
      sockets.clear();
      sourceTimes.clear();
      if (window.WebSocket === ProxySocket) window.WebSocket = Native;
    }, { once: true });
  })();
})();
