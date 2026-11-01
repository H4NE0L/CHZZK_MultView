"use strict";
(() => {
  // src/shared/chat/message-content.js
  var own = (object, key) => object && typeof object === "object" ? Object.getOwnPropertyDescriptor(object, key)?.value : void 0;
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
    let emojis = own(extras, "emojis");
    if (typeof emojis === "string" && emojis.length <= 16e3) {
      try {
        emojis = JSON.parse(emojis);
      } catch (_) {
        emojis = null;
      }
    }
    if (emojis && typeof emojis === "object") for (const key of Object.keys(emojis).slice(0, 32)) {
      const token = imageToken(own(emojis, key));
      if (!token) continue;
      const forms = key.startsWith("{:") ? [key] : [`{:${key}:}`, ...key.startsWith(":") && key.endsWith(":") ? [key] : []];
      for (const form of forms) text = text.split(form).join(token);
    }
    return text;
  }

  // src/shared/chat/source-epoch.js
  var own2 = (object, key) => object && typeof object === "object" ? Object.getOwnPropertyDescriptor(object, key)?.value : void 0;
  function sourceEpoch(message) {
    for (const key of ["messageTime", "messageTimestamp", "msgTime", "createdAt", "createTime", "ctime", "time", "regTime", "timestamp"]) {
      const value = own2(message, key);
      if (!["string", "number"].includes(typeof value) || value === "") continue;
      const number = Number(value), generic = ["time", "regTime", "timestamp"].includes(key);
      if (generic && (!Number.isFinite(number) || number < 1e12)) continue;
      const ms = Number.isFinite(number) ? number * (number < 1e11 ? 1e3 : 1) : Date.parse(value);
      if (Number.isFinite(ms) && ms >= 9466848e5 && ms <= Date.now() + 6e4) return ms;
    }
    return null;
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

  // src/content/chat-metadata-main.js
  (() => {
    if (window.__CZ_CHAT_METADATA_V1__) return;
    window.__CZ_CHAT_METADATA_V1__ = true;
    document.documentElement.setAttribute("data-cz-time-reader", "20261102-4");
    const rows = '[class*="live_chatting_list_item"],[data-chat-message],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
    const names = '[data-chat-nickname],[class*="live_chatting_username_nickname"],[class^="_nickname_"],[class*=" _nickname_"]';
    const own3 = (object, key) => object && typeof object === "object" ? Object.getOwnPropertyDescriptor(object, key)?.value : void 0;
    const clean = (value) => String(value || "").normalize("NFC").replace(/\s+/g, " ").trim();
    function sourceMessage(object, author, body, id) {
      const timestamp = sourceEpoch(object);
      if (timestamp === null) return null;
      let profile = own3(object, "profile") ?? own3(object, "user") ?? own3(object, "sender");
      if (typeof profile === "string" && profile.length < 16e3) {
        try {
          profile = JSON.parse(profile);
        } catch (_) {
          profile = null;
        }
      }
      const name = own3(profile, "nickname") ?? own3(profile, "nickName") ?? own3(object, "nickname") ?? own3(object, "nickName");
      const content = own3(object, "content") ?? own3(object, "msg") ?? own3(object, "message") ?? own3(object, "text");
      if (typeof name !== "string" || typeof content !== "string" || !clean(content) || clean(name) !== author || !(body === clean(sourceContent(content, own3(object, "extras"))) || id && String(own3(object, "messageId") ?? own3(object, "msgId")) === id)) return null;
      return timestamp;
    }
    function search(props, author, body, fields, seen, budget, id) {
      const queue2 = [{ value: props, depth: 0 }], matches = /* @__PURE__ */ new Set();
      while (queue2.length && budget.remaining-- > 0) {
        const { value, depth } = queue2.shift();
        if (!value || typeof value !== "object" || seen.has(value)) continue;
        seen.add(value);
        if (Array.isArray(value)) {
          if (depth < 4) for (let i = 0; i < Math.min(value.length, 8); i++) {
            const child = own3(value, String(i));
            if (child && typeof child === "object") queue2.push({ value: child, depth: depth + 1 });
          }
          continue;
        }
        for (const key of Object.keys(value).slice(0, 12)) if (fields.size < 24) fields.add(key.slice(0, 40));
        const timestamp = sourceMessage(value, author, body, id);
        if (timestamp !== null) matches.add(timestamp);
        if (depth >= 4) continue;
        for (const key of ["message", "messageData", "chatMessage", "chattingMessage", "chatting", "chat", "item", "data", "props", "children"]) {
          const child = own3(value, key);
          if (child && typeof child === "object") queue2.push({ value: child, depth: depth + 1 });
        }
      }
      return matches.size === 1 ? [...matches][0] : null;
    }
    const authoredTimes = /* @__PURE__ */ new Map();
    function ownedTime(row, fields) {
      const candidates = /* @__PURE__ */ new Set(), propsSeen = /* @__PURE__ */ new Set(), fibersSeen = /* @__PURE__ */ new Set();
      let budget = 240;
      const visit = (props) => {
        const queue2 = [{ value: props, depth: 0 }];
        let nearest = Infinity;
        while (queue2.length && budget-- > 0) {
          const { value, depth } = queue2.shift();
          if (depth > nearest || !value || typeof value !== "object" || propsSeen.has(value)) continue;
          propsSeen.add(value);
          if (Array.isArray(value)) {
            if (depth < 6) for (let i = 0; i < Math.min(value.length, 16); i++) queue2.push({ value: own3(value, String(i)), depth: depth + 1 });
            continue;
          }
          for (const key of ["chatMessage", "chattingMessage"]) {
            const message = own3(value, key);
            if (message && typeof message === "object" && !Array.isArray(message)) {
              candidates.add(message);
              nearest = depth;
            }
          }
          if (depth < 6) for (const key of ["props", "children"]) queue2.push({ value: own3(value, key), depth: depth + 1 });
        }
      };
      const nodes = [row];
      let parent = row.parentElement;
      for (let depth = 0; parent && parent !== document.body && depth < 4; depth++, parent = parent.parentElement) {
        const nicknames = [...parent.querySelectorAll(names)].filter((node) => !node.querySelector(names));
        if (nicknames.length !== 1) break;
        if (parent.matches('[class*="live_chatting_list_item"],[data-chat-message],[class*="vod_chatting_item"],[class^="_item_"],[class*=" _item_"]')) nodes.push(parent);
      }
      for (const node of nodes) {
        const keys = Object.getOwnPropertyNames(node);
        for (const key of keys.filter((key2) => key2.startsWith("__reactProps$"))) visit(own3(node, key));
        if (candidates.size) break;
        for (const key of keys.filter((key2) => key2.startsWith("__reactFiber$"))) {
          let fiber = own3(node, key);
          for (let depth = 0; fiber && depth < 60 && budget > 0; depth++, fiber = own3(fiber, "child")) {
            if (fibersSeen.has(fiber)) break;
            fibersSeen.add(fiber);
            const host = own3(fiber, "stateNode");
            if (host instanceof Element && host !== node && !node.contains(host)) break;
            visit(own3(fiber, "memoizedProps"));
            if (candidates.size) break;
          }
          if (candidates.size) break;
        }
        if (candidates.size) break;
      }
      if (!candidates.size) return { found: false, time: null };
      fields.add("react:row-owned");
      const nativeId = row.getAttribute("data-message-id"), matches = /* @__PURE__ */ new Set(), identities = /* @__PURE__ */ new Set(), remember = [];
      for (const message of candidates) {
        const rawId = own3(message, "messageId") ?? own3(message, "msgId"), id = ["string", "number"].includes(typeof rawId) ? String(rawId) : null;
        if (id && nativeId && id !== nativeId) {
          fields.add("react:identity-conflict");
          return { found: true, time: null, blocked: true };
        }
        if (id) identities.add(id);
        const time = (id ? authoredTimes.get(id) : null) ?? sourceEpoch(message);
        if (time === null || time === void 0) {
          fields.add("react:no-authored-time");
          return { found: true, time: null };
        }
        matches.add(time);
        if (id && id.length <= 160) remember.push([id, time]);
      }
      if (matches.size !== 1 || identities.size > 1) {
        fields.add("react:ambiguous");
        return { found: true, time: null, blocked: true };
      }
      for (const [id, time] of remember) authoredTimes.set(id, time);
      while (authoredTimes.size > 2048) authoredTimes.delete(authoredTimes.keys().next().value);
      return { found: true, time: [...matches][0] };
    }
    function writeTime(row, timestamp, fields) {
      if (timestamp !== null) {
        unwatch(row);
        cancelRetry(row);
        retryState.delete(row);
        const iso = new Date(timestamp).toISOString();
        if (row.getAttribute("data-cz-message-time") !== iso) row.setAttribute("data-cz-message-time", iso);
      } else row.removeAttribute("data-cz-message-time");
      const schema = [...fields].join(",").slice(0, 600);
      if (row.getAttribute("data-cz-time-fields") !== schema) row.setAttribute("data-cz-time-fields", schema);
    }
    const retryTimers = /* @__PURE__ */ new Map(), retryState = /* @__PURE__ */ new WeakMap(), retryDelays = [80, 200, 450, 900];
    function cancelRetry(row) {
      clearTimeout(retryTimers.get(row));
      retryTimers.delete(row);
    }
    function retry(row, identity) {
      let state = retryState.get(row);
      if (!state || state.identity !== identity) {
        cancelRetry(row);
        state = { identity, attempt: 0 };
        retryState.set(row, state);
      }
      if (retryTimers.has(row) || state.attempt >= retryDelays.length) return;
      const delay = retryDelays[state.attempt++];
      retryTimers.set(row, setTimeout(() => {
        retryTimers.delete(row);
        if (row.isConnected) queue(row);
      }, delay));
      while (retryTimers.size > 128) cancelRetry(retryTimers.keys().next().value);
    }
    function clearRetries() {
      for (const row of retryTimers.keys()) cancelRetry(row);
    }
    const waiting = /* @__PURE__ */ new Map(), waitingKeys = /* @__PURE__ */ new WeakMap();
    let unsubscribe = null;
    function unwatch(row) {
      const previous = waitingKeys.get(row);
      if (!previous) return;
      const refs = waiting.get(previous);
      if (refs) {
        for (const ref of refs) if (!ref.deref() || ref.deref() === row) refs.delete(ref);
        if (!refs.size) waiting.delete(previous);
      }
      waitingKeys.delete(row);
    }
    function watch(row, key) {
      unwatch(row);
      if (!waiting.has(key)) waiting.set(key, /* @__PURE__ */ new Set());
      const refs = waiting.get(key);
      refs.add(new WeakRef(row));
      while (refs.size > 8) refs.delete(refs.values().next().value);
      while (waiting.size > 128) waiting.delete(waiting.keys().next().value);
      waitingKeys.set(row, key);
    }
    function bodyText(row, nickname) {
      const explicit = row.querySelector('[data-chat-text],[class*="live_chatting_message_text"]');
      let fragment, originalImages;
      if (explicit) {
        fragment = explicit.cloneNode(true);
        originalImages = [...explicit.querySelectorAll("img")];
      } else {
        let boundary = nickname;
        while (boundary.parentElement && boundary.parentElement !== row && /nickname|username/i.test(String(boundary.parentElement.className))) boundary = boundary.parentElement;
        const range = document.createRange();
        range.selectNodeContents(row);
        range.setStartAfter(boundary);
        fragment = range.cloneContents();
        originalImages = [...row.querySelectorAll("img")].filter((image) => !boundary.contains(image) && !!(boundary.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING));
      }
      [...fragment.querySelectorAll("img")].forEach((image, index) => {
        const original = originalImages[index];
        const source = original?.currentSrc || original?.getAttribute("data-src") || original?.src;
        if (source) image.setAttribute("src", source);
      });
      fragment.querySelectorAll('svg,time,[class*="badge" i],[class*="blind" i],[class*="sr_only" i],[hidden]').forEach((node) => node.remove());
      for (const image of fragment.querySelectorAll("img")) image.replaceWith(document.createTextNode(imageToken(image.getAttribute("data-src") || image.src) || image.alt || ""));
      return clean(fragment.textContent);
    }
    function inspect(row) {
      if (!row.isConnected) return;
      const fields = /* @__PURE__ */ new Set(), primary = ownedTime(row, fields);
      if (primary.time !== null) {
        writeTime(row, primary.time, fields);
        return;
      }
      if (primary.blocked) {
        writeTime(row, null, fields);
        retry(row, row.getAttribute("data-message-id") || "ambiguous-source");
        return;
      }
      const nickname = [...row.querySelectorAll(names)].find((node) => !node.querySelector(names));
      if (!nickname) {
        writeTime(row, null, fields);
        retry(row, row.getAttribute("data-message-id") || "row-source");
        return;
      }
      const walker = document.createTreeWalker(nickname, NodeFilter.SHOW_TEXT), parts = [];
      let textNode;
      while ((textNode = walker.nextNode()) && parts.length < 40) {
        const parent = textNode.parentElement;
        if (!parent || parent.closest('svg,[class*="badge" i],[class*="blind" i],[class*="sr_only" i],[hidden],[aria-hidden="true"]')) continue;
        const style = getComputedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden" || style.clip && style.clip !== "auto" || style.clipPath && style.clipPath !== "none") continue;
        parts.push(textNode.textContent);
      }
      const author = clean(parts.join("")), content = bodyText(row, nickname), body = content, id = row.getAttribute("data-message-id") || row.getAttribute("data-chat-id"), seen = /* @__PURE__ */ new Set(), budget = { remaining: 160 };
      if (!author) {
        writeTime(row, null, fields);
        retry(row, id || "row-source");
        return;
      }
      let timestamp = null;
      const nodes = [row, ...row.querySelectorAll('[class*="button_chatting"],' + names)].slice(0, 3);
      if (!primary.found) for (const node of nodes) {
        for (const key of Object.getOwnPropertyNames(node).sort((a, b) => Number(b.startsWith("__reactProps$")) - Number(a.startsWith("__reactProps$")))) {
          if (key.startsWith("__reactProps$")) timestamp = search(own3(node, key), author, body, fields, seen, budget, id);
          else if (key.startsWith("__reactFiber$")) {
            const root = own3(node, key), visited = /* @__PURE__ */ new Set();
            let child = root;
            for (let depth = 0; child && depth < 32 && timestamp === null && budget.remaining > 0; depth++, child = own3(child, "child")) {
              if (visited.has(child)) break;
              visited.add(child);
              const host = own3(child, "stateNode");
              if (host instanceof Element && host !== node && !node.contains(host)) break;
              timestamp = search(own3(child, "memoizedProps"), author, body, fields, seen, budget, id);
            }
            let parent = own3(root, "return");
            for (let depth = 0; parent && depth < 7 && timestamp === null && budget.remaining > 0; depth++, parent = own3(parent, "return")) {
              if (visited.has(parent)) break;
              visited.add(parent);
              timestamp = search(own3(parent, "memoizedProps"), author, body, fields, seen, budget, id);
            }
          }
          if (timestamp !== null) break;
        }
        if (timestamp !== null) break;
      }
      if (timestamp === null) {
        timestamp = sourceTimes.lookup(author, content, id);
        if (timestamp !== null && fields.size < 24) fields.add("socket:source-time");
      }
      if (timestamp === null) {
        watch(row, id ? "id:" + id : "body:" + sourceTimes.key(author, content));
        retry(row, sourceTimes.key(author, content) + ":" + (id || ""));
      } else {
        unwatch(row);
        cancelRetry(row);
        retryState.delete(row);
      }
      writeTime(row, timestamp, fields);
    }
    const pending = /* @__PURE__ */ new Set();
    let job = 0, scheduled = false, enabled = false, disposed = false;
    function queue(node) {
      if (!enabled || disposed) return;
      if (node.nodeType !== 1) node = node.parentElement;
      if (!node || node.matches(".cz-native-chat-time")) return;
      const closest = node.closest(rows);
      if (closest) pending.add(closest);
      else [...node.querySelectorAll(rows)].slice(-200).forEach((row) => pending.add(row));
      if (!scheduled && pending.size) {
        scheduled = true;
        const current = job;
        queueMicrotask(() => {
          if (current !== job) return;
          scheduled = false;
          const batch = [...pending].slice(-200);
          pending.clear();
          batch.forEach((row) => {
            try {
              inspect(row);
            } catch (_) {
              row.removeAttribute("data-cz-message-time");
              row.setAttribute("data-cz-time-fields", "reader-error");
            }
          });
        });
      }
    }
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData" || record.type === "attributes") queue(record.target);
        else for (const node of record.addedNodes) queue(node);
      }
    });
    function configure() {
      observer.disconnect();
      job++;
      scheduled = false;
      pending.clear();
      clearRetries();
      unsubscribe?.();
      unsubscribe = null;
      waiting.clear();
      enabled = !disposed && (document.documentElement.hasAttribute("data-cz-timestamps-enabled") ? document.documentElement.getAttribute("data-cz-timestamps-enabled") === "true" : new URLSearchParams(location.search).get("cz_timestamps") === "1");
      if (enabled) {
        unsubscribe = sourceTimes.subscribe?.(({ key, id }) => {
          for (const token of ["body:" + key, ...id ? ["id:" + id] : []]) for (const ref of waiting.get(token) || []) {
            const row = ref.deref();
            if (row?.isConnected) queue(row);
          }
        });
        observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-index", "data-item-index", "data-message-id", "data-chat-id", "src", "srcset", "alt"] });
        queue(document.documentElement);
      } else {
        authoredTimes.clear();
        sourceTimes.clear();
        document.querySelectorAll("[data-cz-message-time],[data-cz-time-fields]").forEach((row) => {
          row.removeAttribute("data-cz-message-time");
          row.removeAttribute("data-cz-time-fields");
        });
      }
    }
    const imageLoaded = (event) => {
      if (event.target instanceof HTMLImageElement) queue(event.target);
    };
    document.addEventListener("load", imageLoaded, true);
    document.addEventListener("cz-chat-timestamps-config", configure);
    configure();
    window.addEventListener("pagehide", () => {
      disposed = true;
      authoredTimes.clear();
      clearRetries();
      document.removeEventListener("load", imageLoaded, true);
      unsubscribe?.();
      waiting.clear();
      observer.disconnect();
      job++;
      scheduled = false;
      pending.clear();
      document.removeEventListener("cz-chat-timestamps-config", configure);
    }, { once: true });
  })();
})();
