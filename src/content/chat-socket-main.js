"use strict";
(() => {
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
    const entries = /* @__PURE__ */ new Map(), byId = /* @__PURE__ */ new Map();
    const valid = (value) => {
      const n = Number(value), ms = Number.isFinite(n) ? n * (n < 1e11 ? 1e3 : 1) : Date.parse(value);
      return Number.isFinite(ms) && ms >= 9466848e5 && ms <= Date.now() + 6e4 ? ms : null;
    };
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
      const time = valid(message.messageTime ?? message.msgTime ?? message.ctime ?? message.createdAt);
      if (typeof name !== "string" || typeof text !== "string" || !text.trim() || text.length > 16e3 || time === null) return;
      const key = keyFor(name, text), old = entries.get(key);
      entries.set(key, old && old !== time ? -1 : time);
      while (entries.size > 2048) entries.delete(entries.keys().next().value);
      const id = message.messageId ?? message.msgId ?? message.id;
      if (["string", "number"].includes(typeof id) && String(id).length <= 160) {
        byId.set(String(id), { key, time });
        while (byId.size > 2048) byId.delete(byId.keys().next().value);
      }
    }
    return { add, lookup(name, text, id) {
      const key = keyFor(name, text);
      if (id) {
        const entry = byId.get(String(id));
        return entry?.key === key ? entry.time : null;
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
    let disposed = false, enabled = false;
    function receive(event) {
      if (disposed || !enabled || typeof event.data !== "string" || event.data.length > 1024 * 1024) return;
      let packet;
      try {
        packet = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      const body = packet?.bdy ?? packet?.body;
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
      enabled = !disposed && document.documentElement?.getAttribute("data-cz-timestamps-enabled") === "true";
      for (const socket of sockets.keys()) {
        socket.removeEventListener("message", receive);
        if (enabled) socket.addEventListener("message", receive);
      }
      if (!enabled) sourceTimes.clear();
    }
    document.addEventListener("cz-chat-timestamps-config", configure);
    configure();
    window.WebSocket = ProxySocket;
    window.addEventListener("pagehide", () => {
      disposed = true;
      document.removeEventListener("cz-chat-timestamps-config", configure);
      for (const close of sockets.values()) close();
      sockets.clear();
      sourceTimes.clear();
      if (window.WebSocket === ProxySocket) window.WebSocket = Native;
    }, { once: true });
  })();
})();
