"use strict";
(() => {
  // src/shared/chat/roles.ts
  var nameKey = (value) => String(value || "").normalize("NFC").trim().toLocaleLowerCase("ko-KR");
  function colorRole(color) {
    const values = String(color).match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
    if (!values) return "";
    const [r = 0, g = 0, b = 0] = values.slice(1, 4).map((value) => Number(value) / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (max < 0.5 || delta / max < 0.45) return "";
    let hue = max === r ? (g - b) / delta % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    if (hue >= 20 && hue <= 60) return "streamer";
    if (hue >= 190 && hue <= 250) return "manager";
    if (hue >= 90 && hue < 185) return "partner";
    return "";
  }
  function evidence(raw, semantic) {
    const values = raw.map((value) => String(value || "").normalize("NFC").trim().toLowerCase().replace(/(?:\s*(?:배지|아이콘)|\s+(?:badge|icon))$/, "").trim());
    const markers = semantic.map((value) => String(value || "").toLowerCase());
    let next = "";
    if (values.some((v) => ["스트리머", "방송자", "방송인", "streamer", "broadcaster", "owner", "streaming_channel_owner"].includes(v)) || markers.some((v) => !/(?:^|[._\s/#-])partner(?:$|[._\s/#-])/.test(v) && /(?:^|[._\s/#-])(?:streamer|broadcaster|streaming_channel_owner)(?:$|[._\s/#-])/.test(v))) next = "streamer";
    else if (values.some((v) => ["채널 관리자", "채널관리자", "채널 매니저", "매니저", "방송 관리자", "관리자", "manager", "channel manager", "channel_manager", "streaming_channel_manager"].includes(v)) || markers.some((v) => /(?:^|[._\s/#-])(?:manager|channel_manager|streaming_channel_manager)(?:$|[._\s/#-])/.test(v))) next = "manager";
    else if (values.some((v) => ["파트너", "파트너 스트리머", "공식 파트너", "partner", "partner streamer", "partner_streamer"].includes(v)) || markers.some((v) => /(?:^|[._\s/#-])partner(?:$|[._\s/#-])/.test(v))) next = "partner";
    return { role: next, labels: values, markers };
  }
  function strongest(current, next) {
    const priority = { "": 0, streamer: 3, manager: 2, partner: 1 };
    return priority[next] > priority[current] ? next : current;
  }

  // src/content/chat/dom-adapter.js
  function create({ getOwnerName }) {
    const rows = '[class*="live_chatting_list_item"],[class*="live_chatting_message_container"],[data-chat-message],[class*="live_chatting_message_item"],[role="listitem"],[class*="live_chatting_message_wrapper"],[class*="live_chatting_chat_item"],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
    const names = '[class*="live_chatting_username_nickname"],[class*="name_text"],[data-chat-nickname],[class*="username"] [class*="nickname"],[class^="_nickname_"],[class*=" _nickname_"]';
    const texts = '[class*="live_chatting_message_text"],[data-chat-text]';
    let scrollModes = /* @__PURE__ */ new WeakMap();
    function readingHistory(row) {
      const parent = row.parentElement;
      if (!parent) return false;
      if (scrollModes.has(parent)) return scrollModes.get(parent);
      let past = false;
      for (let node = parent; node; node = node.parentElement) {
        if (/auto|scroll|overlay/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 4) {
          past = node.scrollHeight - node.clientHeight - node.scrollTop > 32;
          break;
        }
      }
      scrollModes.set(parent, past);
      return past;
    }
    function domSummary(scanned) {
      let socketTimeSource = null;
      try {
        const raw = document.documentElement.getAttribute("data-cz-socket-time-state") || "";
        if (raw.length < 600) socketTimeSource = JSON.parse(raw);
      } catch (_) {
      }
      return {
        socketTimeSource,
        sourceTimeReader: document.documentElement.getAttribute("data-cz-time-reader") || "",
        rowCandidates: document.querySelectorAll(rows).length,
        nicknameCandidates: document.querySelectorAll(names).length,
        classes: scanned ? [] : [...new Set([...document.querySelectorAll('[class*="chat"],[class*="name"]')].slice(-100).map((el) => String(el.className || "").slice(0, 160)))].slice(-40)
      };
    }
    const leafNames = (node) => {
      const found = [...node.querySelectorAll(names)].filter((el) => !el.querySelector(names));
      const messageRows = '[data-chat-message],[class*="live_chatting_list_item"],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
      return node.matches?.(messageRows) && !node.querySelector(messageRows) ? found.slice(0, 1) : found;
    };
    const decorations = '[class*="badge" i],[class*="blind" i],[class*="sr_only" i],[class*="screen_reader" i],[class*="visually_hidden" i],svg,script,style,time,[data-role="streamer"],[data-role="manager"],[data-role="partner"],[data-user-role],[data-user-type]';
    const isDecoration = (node) => node.matches?.(decorations) && !node.matches('button[class*="button_chatting"]');
    function authorBoundary(row, nickname) {
      let boundary = nickname;
      while (boundary.parentElement && boundary.parentElement !== row && (boundary.parentElement.matches(names) || /username|nickname/i.test(String(boundary.parentElement.className)))) boundary = boundary.parentElement;
      return boundary;
    }
    const nameDecorations = decorations.split(",").filter((selector) => selector !== "button" && !selector.startsWith("[data-")).join(",") + ',img,[hidden],[aria-hidden="true"]';
    function authorName(nickname) {
      const copy = nickname.cloneNode(true), originals = [...nickname.querySelectorAll("*")], clones = [...copy.querySelectorAll("*")];
      originals.forEach((el, index) => {
        const style = getComputedStyle(el);
        if (el.matches(nameDecorations) || style.display === "none" || style.visibility === "hidden" || style.clip && style.clip !== "auto" || style.clipPath && style.clipPath !== "none") clones[index].remove();
      });
      return copy.textContent.trim().slice(0, 80);
    }
    function markImage(el) {
      if (!el.matches?.('img,svg,[role="img"]')) return false;
      const label = ["alt", "title", "aria-label"].map((key) => el.getAttribute(key) || "").join(" ") + " " + (el.querySelector?.("title")?.textContent || "");
      const asset = el.getAttribute("src") || "";
      return /인증\s*(?:마크|배지)|공식\s*(?:마크|배지)|(?:파트너|스트리머|관리자)\s*(?:마크|배지)|verified|verification|certified|certification|official\s*(?:mark|badge)/i.test(label) || /(?:^|[/_.-])(?:badge|verified|verification|certified)(?:[/_.-]|$)/i.test(asset.split("?")[0]);
    }
    const bodyIgnored = (node) => node.matches?.('script,style,time,[hidden],[class*="blind" i],[class*="sr_only" i],[class*="screen_reader" i],[class*="visually_hidden" i]');
    const imageSource = (image) => {
      const candidates = [image.getAttribute("data-src"), image.getAttribute("data-srcset")?.split(/[\s,]+/)[0], image.currentSrc, image.getAttribute("src"), image.getAttribute("srcset")?.split(/[\s,]+/)[0]];
      for (const candidate of candidates) {
        if (!candidate?.trim()) continue;
        try {
          const url = new URL(candidate.startsWith("//") ? "https:" + candidate : candidate, document.baseURI);
          if (url.protocol === "https:") return url.href;
        } catch (_) {
        }
      }
      return "";
    };
    function copyImageSources(originals, copies) {
      originals.forEach((image, index) => {
        const source = imageSource(image);
        if (copies[index]) {
          copies[index].removeAttribute("srcset");
          copies[index].removeAttribute("sizes");
          if (source) copies[index].setAttribute("src", source);
          else copies[index].removeAttribute("src");
        }
      });
    }
    function cloneBody(node) {
      const copy = node.cloneNode(true);
      copyImageSources(node.matches?.("img") ? [node] : [...node.querySelectorAll("img")], copy.matches?.("img") ? [copy] : [...copy.querySelectorAll("img")]);
      return cleanBody(copy, false);
    }
    function cleanBody(fragment, authorSuffix = true) {
      fragment.querySelectorAll("script,style,time,[hidden],[class*=blind i],[class*=sr_only i],[class*=screen_reader i],[class*=visually_hidden i]").forEach((el) => el.remove());
      const prefix = (node) => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === 3) {
            if (child.textContent.trim()) return false;
            continue;
          }
          if (child.nodeType !== 1) continue;
          if (markImage(child) || child.matches('svg,[class*="badge" i],[data-user-role],[data-user-type]')) {
            child.remove();
            continue;
          }
          if (child.matches("img,br,svg")) return false;
          if (!prefix(child)) return false;
        }
        return true;
      };
      if (authorSuffix) prefix(fragment);
      return fragment;
    }
    function afterName(row, nickname) {
      const range = document.createRange();
      range.selectNodeContents(row);
      range.setStartAfter(authorBoundary(row, nickname));
      const fragment = range.cloneContents(), boundary = authorBoundary(row, nickname);
      copyImageSources([...row.querySelectorAll("img")].filter((image) => !boundary.contains(image) && !!(boundary.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING)), [...fragment.querySelectorAll("img")]);
      return cleanBody(fragment);
    }
    function textAfter(row, nickname) {
      return content(afterName(row, nickname)).trim();
    }
    function richParts(node, parts = []) {
      if (parts.length >= 64) return parts;
      if (node.nodeType === 3) {
        parts.push({ type: "text", text: node.textContent });
        return parts;
      }
      if (node.nodeType !== 1 && node.nodeType !== 11) return parts;
      if (bodyIgnored(node)) return parts;
      if (node.tagName === "IMG") {
        parts.push({ type: "image", src: node.currentSrc || node.src || "", alt: node.getAttribute("alt") || "[이모티콘]" });
        return parts;
      }
      if (node.tagName?.toLowerCase() === "svg") {
        parts.push({ type: "text", text: node.getAttribute("aria-label") || node.querySelector("title")?.textContent || "[이모티콘]" });
        return parts;
      }
      if (node.tagName === "BR") {
        parts.push({ type: "text", text: "\n" });
        return parts;
      }
      for (const child of node.childNodes) richParts(child, parts);
      return parts;
    }
    function rowForName(nickname) {
      if (nickname.closest('.cz-native-chat-header,[role="menu"],[role="dialog"],[data-cz-collection-profile],#cz-chat-settings')) return null;
      for (let panel = nickname.parentElement, depth = 0; panel && panel !== document.body && depth < 6; depth++, panel = panel.parentElement) {
        if (panel.matches(rows) || panel.querySelector(rows) || leafNames(panel).length > 1) break;
        const actions = [...panel.querySelectorAll("button,a,[role=button],[role=menuitem]")].map((node) => String(node.textContent || "").replace(/\s+/g, ""));
        if (actions.includes("메시지신고") && actions.includes("사용자차단")) return null;
      }
      const known = nickname.closest(rows);
      if (known) return known;
      let row = nickname.parentElement;
      for (let depth = 0; row && row !== document.body && depth < 7; depth++, row = row.parentElement) {
        const found = leafNames(row);
        if (found.length > 1) return null;
        if (found.length !== 1 || row.matches("button,a,[role=button]") || /username|nickname|button_chatting/.test(String(row.className))) continue;
        if (row.querySelector(texts) || textAfter(row, nickname)) return row;
      }
      return null;
    }
    function bodyColor(row, nickname, parts) {
      for (const part of parts) {
        const role2 = colorRole(getComputedStyle(part).color);
        if (role2) return { role: role2, color: getComputedStyle(part).color };
      }
      const boundary = authorBoundary(row, nickname), walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (boundary.contains(node) || !String(node.textContent).trim() || !(boundary.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        const parent = node.parentElement;
        if (!parent) continue;
        const decoration = parent.closest(decorations);
        if (decoration && isDecoration(decoration)) continue;
        const style = getComputedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden") continue;
        return { role: colorRole(style.color), color: style.color };
      }
      for (const image of row.querySelectorAll("img")) {
        if (boundary.contains(image) || markImage(image) || !(boundary.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        const color2 = getComputedStyle(image).color;
        if (colorRole(color2)) return { role: colorRole(color2), color: color2 };
      }
      const color = getComputedStyle(row).color;
      return { role: colorRole(color), color };
    }
    let roleSample = [];
    function role(row, textElements, nickname, suffix = /* @__PURE__ */ new Set()) {
      if (getOwnerName() && nameKey(authorName(nickname)) === nameKey(getOwnerName())) return "streamer";
      let author = authorBoundary(row, nickname);
      for (let node = author, depth = 0; node && node !== row && depth < 4; node = node.parentElement, depth++) if (/username|nickname|author/.test(String(node.className))) author = node;
      let detected = "";
      roleSample = [];
      const candidates = row.querySelectorAll('img,svg,svg use,[data-role],[data-user-role],[data-user-type],[aria-label],[title],[class*="badge"],[class*="Badge"]');
      for (const badge of candidates) {
        if (textElements.some((el) => el === badge || el.contains(badge))) continue;
        const beforeName = !!(badge.compareDocumentPosition(nickname) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (!beforeName && !badge.contains(nickname) && !author.contains(badge) && !suffix.has(badge) && !suffix.has(badge.closest("svg"))) continue;
        const raw = ["alt", "title", "aria-label", "data-role", "data-user-role", "data-user-type"].map((key) => {
          const value = badge.getAttribute(key);
          return badge.contains(nickname) && ["alt", "title", "aria-label"].includes(key) && nameKey(value) === nameKey(nickname.textContent) ? "" : value;
        });
        if (badge.matches("svg")) raw.push(...[...badge.querySelectorAll("title")].map((el) => el.textContent));
        const semantic = [badge.getAttribute("class"), badge.getAttribute("id")];
        if (badge.matches("use")) semantic.push(badge.getAttribute("href"), badge.getAttribute("xlink:href"));
        if (badge.matches("img")) {
          try {
            semantic.push(new URL(badge.currentSrc || badge.src).pathname.split("/").at(-1));
          } catch (_) {
          }
        }
        const parsed = evidence(raw, semantic);
        if (roleSample.length < 8) roleSample.push({ tag: badge.tagName, labels: parsed.labels.filter(Boolean).slice(0, 4).map((value) => value.slice(0, 80)), markers: parsed.markers.filter(Boolean).slice(0, 3).map((value) => value.slice(0, 120)) });
        detected = strongest(detected, parsed.role);
      }
      if (detected) return detected;
      const body = bodyColor(row, nickname, textElements);
      roleSample.unshift({ tag: "BODY_COLOR", labels: [body.color], markers: [] });
      return body.role;
    }
    function content(node) {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1 && node.nodeType !== 11) return "";
      if (bodyIgnored(node)) return "";
      if (node.tagName === "IMG") return node.getAttribute("alt") || "[이모티콘]";
      if (node.tagName?.toLowerCase() === "svg") return node.getAttribute("aria-label") || node.querySelector("title")?.textContent || "[이모티콘]";
      if (node.tagName === "BR") return "\n";
      return Array.from(node.childNodes, content).join("");
    }
    function normalizeRow(row) {
      row = row.closest(rows) || row;
      const outer = row.closest('[class*="live_chatting_list_item"],[data-chat-message]');
      return outer && leafNames(outer).length === 1 ? outer : row;
    }
    function aboveHeader(row) {
      const header = document.querySelector(".cz-native-chat-header");
      if (header && !(header.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        const box = row.getBoundingClientRect(), toolbar = header.getBoundingClientRect();
        return box.height > 0 && box.bottom <= toolbar.top;
      }
      return false;
    }
    function badgeSVG(element) {
      if (!element.matches("svg")) return null;
      let nodes = [...element.querySelectorAll("path,circle,rect,ellipse,line,polygon,polyline")];
      if (!nodes.length) {
        const href = element.querySelector("use")?.getAttribute("href") || element.querySelector("use")?.getAttribute("xlink:href");
        if (href?.startsWith("#")) nodes = [...document.getElementById(href.slice(1))?.querySelectorAll("path,circle,rect,ellipse,line,polygon,polyline") || []];
      }
      return { viewBox: element.getAttribute("viewBox") || "0 0 24 24", color: getComputedStyle(element).color, shapes: nodes.slice(0, 8).map((node) => {
        const attrs = {};
        for (const name of ["d", "cx", "cy", "r", "x", "y", "width", "height", "rx", "ry", "x1", "x2", "y1", "y2", "points", "stroke-width"]) {
          const value = node.getAttribute(name);
          if (value) attrs[name] = value.slice(0, 2048);
        }
        attrs.fill = getComputedStyle(node).fill;
        attrs.stroke = getComputedStyle(node).stroke;
        return { tag: node.tagName.toLowerCase(), attrs };
      }) };
    }
    function read(row) {
      const nickname = leafNames(row)[0], parts = Array.from(row.querySelectorAll(texts));
      const structure = { row: String(row.className || row.tagName).slice(0, 180), nickname: nickname ? String(nickname.className || nickname.tagName).slice(0, 180) : "찾지 못함", text: parts[0] ? String(parts[0].className || parts[0].tagName).slice(0, 180) : "찾지 못함" };
      if (!nickname) return { structure, message: null };
      structure.timestampSource = row.hasAttribute("data-cz-message-time") ? "source-message" : row.hasAttribute("data-message-time") || row.hasAttribute("data-timestamp") || row.hasAttribute("data-created-at") ? "dom-attribute" : "unavailable";
      structure.timestampFields = (row.getAttribute("data-cz-time-fields") || "").slice(0, 600);
      structure.authorDecorations = [...row.querySelectorAll("img,svg,[role=img],[class*=blind i],[class*=sr_only i]")].slice(0, 8).map((el) => ({ tag: el.tagName, class: String(el.className?.baseVal ?? el.className ?? "").slice(0, 120), alt: (el.getAttribute("alt") || el.getAttribute("aria-label") || "").slice(0, 80), asset: (el.getAttribute("src") || "").split("?")[0].split("/").pop().slice(0, 100) }));
      const topParts = parts.filter((part) => !parts.some((other) => other !== part && other.contains(part)));
      let fallbackFragment = null;
      const bodyFragments = topParts.map(cloneBody);
      let body = bodyFragments.map(content).join(" ").trim();
      if (!body) {
        fallbackFragment = afterName(row, nickname);
        body = content(fallbackFragment).trim();
        if (body) structure.text = "이름 뒤 DOM (대체 경로)";
      }
      const name = authorName(nickname), text = body.slice(0, 1e3);
      if (!name || !text) return { structure, message: null };
      const segments = [];
      if (bodyFragments.some((fragment) => content(fragment).trim())) {
        for (const part of bodyFragments) richParts(part, segments);
      } else richParts(fallbackFragment || afterName(row, nickname), segments);
      const nativeTime = row.getAttribute("data-cz-message-time") || row.getAttribute("data-message-time") || row.getAttribute("data-timestamp") || row.getAttribute("data-created-at") || row.querySelector("time:not(.cz-native-chat-time)")?.getAttribute("datetime") || "";
      const before = [], after = [], boundary = authorBoundary(row, nickname), suffix = /* @__PURE__ */ new Set();
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let candidate;
      while (candidate = walker.nextNode()) {
        if (boundary.contains(candidate) || !(boundary.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        if (candidate.nodeType === 3) {
          if (candidate.textContent.trim() && !candidate.parentElement.closest(decorations)) break;
          continue;
        }
        if (candidate.matches("img,svg")) {
          if (candidate.matches("svg") || markImage(candidate) || candidate.closest('[class*="badge" i]')) suffix.add(candidate);
          else break;
        }
      }
      for (const element of [...row.querySelectorAll("img,svg")]) {
        if (topParts.some((part) => part === element || part.contains(element))) continue;
        const preceding = !!(element.compareDocumentPosition(nickname) & Node.DOCUMENT_POSITION_FOLLOWING);
        const following = !!(boundary.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (!preceding && !boundary.contains(element) && !(following && suffix.has(element))) continue;
        const badge = { svg: badgeSVG(element), src: element.matches("img") ? element.currentSrc || element.src || "" : "", alt: element.getAttribute("alt") || element.getAttribute("aria-label") || element.querySelector("title")?.textContent || "배지" };
        (preceding ? before : after).push(badge);
      }
      const badges = before.slice(0, 8), badgesAfter = after.slice(0, 8), nameColor = getComputedStyle(nickname).color, bodyColor2 = topParts[0] ? getComputedStyle(topParts[0]).color : getComputedStyle(row).color;
      return { structure, message: { name, text, segments, nativeTime, badgesAfter, nameColor, bodyColor: bodyColor2, sourceId: row.getAttribute("data-message-id") || row.getAttribute("data-chat-id"), badges, role: role(row, topParts, nickname, suffix) } };
    }
    return {
      rows,
      names,
      texts,
      leafNames,
      rowForName,
      normalizeRow,
      aboveHeader,
      read,
      readingHistory,
      summary: domSummary,
      resetScroll() {
        scrollModes = /* @__PURE__ */ new WeakMap();
      },
      get roleSample() {
        return roleSample;
      }
    };
  }

  // src/shared/chat/history.ts
  function hash(value) {
    let a = 2166136261, b = 5381;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      a = Math.imul(a ^ code, 16777619);
      b = Math.imul(b, 33) ^ code;
    }
    return `${value.length}:${a >>> 0}:${b >>> 0}`;
  }
  function create2(limit = 2048) {
    if (!Number.isInteger(limit) || limit < 1) throw Error("History limit must be positive");
    const entries = /* @__PURE__ */ new Map();
    return {
      get size() {
        return entries.size;
      },
      get(key) {
        return entries.get(key);
      },
      clear() {
        entries.clear();
      },
      remember(key, identity, signature, matched) {
        if (!matched) return;
        entries.delete(key);
        entries.set(key, { id: identity.id, time: identity.time, signature: hash(signature), matched });
        if (entries.size > limit) entries.delete(entries.keys().next().value);
      }
    };
  }

  // src/shared/runtime/scope.ts
  var ResourceScope = class {
    constructor(report = console.error) {
      this.report = report;
    }
    report;
    cleanups = /* @__PURE__ */ new Set();
    disposed = false;
    get isDisposed() {
      return this.disposed;
    }
    get size() {
      return this.cleanups.size;
    }
    add(cleanup) {
      let active = true;
      const release = () => {
        if (!active) return;
        active = false;
        this.cleanups.delete(release);
        try {
          cleanup();
        } catch (error) {
          this.report(error);
        }
      };
      if (this.disposed) release();
      else this.cleanups.add(release);
      return release;
    }
    listen(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      return this.add(() => target.removeEventListener(type, listener, options));
    }
    observe(observer) {
      return this.add(() => observer.disconnect());
    }
    timeout(callback, milliseconds) {
      let release = () => {
      };
      const id = globalThis.setTimeout(() => {
        release();
        callback();
      }, milliseconds);
      release = this.add(() => globalThis.clearTimeout(id));
      return release;
    }
    interval(callback, milliseconds) {
      const id = globalThis.setInterval(callback, milliseconds);
      return this.add(() => globalThis.clearInterval(id));
    }
    frame(callback) {
      let release = () => {
      };
      const id = globalThis.requestAnimationFrame((time) => {
        release();
        callback(time);
      });
      release = this.add(() => globalThis.cancelAnimationFrame(id));
      return release;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const release of [...this.cleanups].reverse()) release();
    }
  };

  // src/content/chat-collector.js
  globalThis.CZChatCollector = { create({ send, status = () => {
  } }) {
    let filter = CZImportantChat.settings({ enabled: false }), observer = null, timer = null, sequence = 0, lastOrder = 0, baseline = false, configuredOnce = false, canActivate = false, since = Infinity;
    const session = globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2), orders = /* @__PURE__ */ new WeakMap(), blockedRows = /* @__PURE__ */ new WeakSet(), bornLive = /* @__PURE__ */ new WeakSet();
    function orderFor(row, fresh = false) {
      if (fresh || !orders.has(row)) {
        lastOrder = Math.max(lastOrder + 1, Date.now() * 1e3);
        orders.set(row, lastOrder);
      }
      return orders.get(row);
    }
    const history = create2();
    let identities = /* @__PURE__ */ new WeakMap(), liveTails = /* @__PURE__ */ new WeakMap();
    let liveInserts = /* @__PURE__ */ new WeakSet();
    let replacements = /* @__PURE__ */ new WeakMap();
    let seen = /* @__PURE__ */ new WeakMap(), observed = /* @__PURE__ */ new WeakSet(), ownerName = "", statusTimer = null;
    let counts = { scanned: 0, parsed: 0, matched: 0, sent: 0, restored: 0 };
    let structure = null;
    const pending = /* @__PURE__ */ new Map();
    const scope = new ResourceScope();
    let releaseObserver = null;
    const dom = create({ getOwnerName: () => ownerName });
    const { rows, names, leafNames, rowForName } = dom;
    const readingHistory = (row) => dom.readingHistory(row);
    function report() {
      if (!statusTimer) statusTimer = scope.timeout(() => {
        statusTimer = null;
        status({ ...counts, revision: "collection-emotes-2", historyEntries: history.size, ownerKnown: !!ownerName, enabled: filter.enabled, structure, roleSample: dom.roleSample, dom: dom.summary(counts.scanned) });
      }, 500);
    }
    function flush() {
      timer?.();
      timer = null;
      if (pending.size) {
        const batch = Array.from(pending.values()).sort((a, b) => a.order - b.order);
        for (let i = 0; i < batch.length; i += CZImportantChat.BATCH_SIZE) send(batch.slice(i, i + CZImportantChat.BATCH_SIZE));
        counts.sent += batch.length;
        pending.clear();
        report();
      }
    }
    function read(row) {
      row = dom.normalizeRow(row);
      if (!row.isConnected) return;
      if (leafNames(row).length > 1) {
        for (const child of [...row.querySelectorAll(rows)]) if (leafNames(child).length === 1) read(child);
        return;
      }
      if (!observed.has(row)) {
        observed.add(row);
        counts.scanned++;
        report();
      }
      if (!orders.has(row) && !baseline) bornLive.add(row);
      orderFor(row);
      if (baseline) blockedRows.add(row);
      if (dom.aboveHeader(row)) return;
      const parsed = dom.read(row);
      structure = parsed.structure;
      report();
      if (!parsed.message) return;
      const { name, text, segments, nativeTime, sourceId, badges, badgesAfter, nameColor, bodyColor, role } = parsed.message;
      const fingerprint = JSON.stringify([name, text]), shape = JSON.stringify([name, segments.map((part) => part.type === "image" ? { type: "image", src: part.src } : part)]), hint = replacements.get(row);
      const historyKey = sourceId ? "native:" + sourceId : hash(JSON.stringify([name, text, segments, nativeTime]));
      const existing = identities.get(row), sameExisting = !!existing && (sourceId ? existing.id === sourceId : existing.fingerprint === fingerprint || existing.shape === shape);
      const cached = history.get(historyKey), restored = cached && !sameExisting && (sourceId || !liveInserts.has(row) && readingHistory(row)) ? cached : null;
      const previous = (sameExisting ? existing : null) || (hint?.fingerprint === fingerprint && (!sourceId || sourceId === hint.id) ? hint : null) || (restored ? { ...restored, fingerprint } : null);
      const id = String(sourceId || previous?.id || "local:" + session + ":" + ++sequence).slice(0, 160);
      if (existing && !sameExisting && !previous) {
        orderFor(row, true);
        bornLive.add(row);
      }
      const activated = baseline && canActivate && bornLive.has(row) && orderFor(row) >= since * 1e3;
      const historical = !activated && (blockedRows.has(row) || baseline || sameExisting && existing.historical || !existing && !liveInserts.has(row) && readingHistory(row));
      blockedRows.delete(row);
      const item = CZImportantChat.message({ id, name, text, segments, badges, badgesAfter, nameColor, bodyColor, role, order: previous?.order ?? orderFor(row), time: CZImportantChat.timestamp(nativeTime) ?? previous?.time ?? null });
      if (!item) return;
      if (historical) item.updateOnly = true;
      if (liveInserts.has(row) || !readingHistory(row)) liveTails.set(row.parentElement, new WeakRef(row));
      const signature = JSON.stringify(item);
      if (restored && restored.id === id && (restored.matched || restored.signature === hash(signature))) {
        const identity2 = { fingerprint, shape, id, time: item.time, order: item.order, signature, historical: true };
        identities.set(row, identity2);
        seen.set(row, identity2);
        counts.restored++;
        history.remember(historyKey, identity2, signature, restored.matched || CZImportantChat.matches(item, filter));
        report();
        return;
      }
      if (replacements.has(row) && previous?.signature === signature) {
        identities.set(row, previous);
        seen.set(row, previous);
        return;
      }
      if (seen.get(row)?.signature === signature) return;
      counts.parsed++;
      report();
      const matched = CZImportantChat.matches(item, filter);
      const identity = { fingerprint, shape, id, time: item.time, order: item.order, signature, historical: !!historical, collected: previous?.collected === true || matched && !historical };
      identities.set(row, identity);
      seen.set(row, identity);
      history.remember(historyKey, identity, signature, matched || !!historical);
      if (!matched || historical && !previous?.collected) return;
      counts.matched++;
      pending.set(id, item);
      if (!timer) timer = scope.timeout(flush, 250);
    }
    function scan(node) {
      const el = node.nodeType === 1 ? node : node.parentElement;
      if (!el) return;
      const closest = el.closest(rows);
      if (closest) {
        read(closest);
        return;
      } else Array.from(el.querySelectorAll(rows)).forEach(read);
      const candidates = new Set([...el.querySelectorAll(names)].filter((nickname) => !nickname.closest(rows)));
      const own = el.closest(names);
      if (own) candidates.add(own);
      let ancestor = el;
      for (let depth = 0; ancestor && ancestor !== document.body && depth < 5; depth++, ancestor = ancestor.parentElement) {
        const found = leafNames(ancestor);
        if (found.length === 1) {
          candidates.add(found[0]);
          break;
        }
        if (found.length > 1) break;
      }
      for (const nickname of candidates) {
        const row = rowForName(nickname);
        if (row) read(row);
      }
      if (!counts.scanned) report();
    }
    function stop() {
      releaseObserver?.();
      releaseObserver = null;
      observer = null;
      timer?.();
      timer = null;
      pending.clear();
      seen = /* @__PURE__ */ new WeakMap();
      observed = /* @__PURE__ */ new WeakSet();
      statusTimer?.();
      statusTimer = null;
    }
    function configure(value, identity = {}) {
      if (scope.isDisposed) return;
      if (pending.size) flush();
      stop();
      canActivate = configuredOnce;
      configuredOnce = true;
      since = typeof identity.since === "number" && Number.isFinite(identity.since) ? identity.since : Date.now();
      dom.resetScroll();
      structure = null;
      counts = { scanned: 0, parsed: 0, matched: 0, sent: 0, restored: 0 };
      ownerName = typeof identity.streamerName === "string" ? identity.streamerName.slice(0, 80) : "";
      filter = CZImportantChat.settings(value);
      report();
      if (!filter.enabled) return;
      observer = new MutationObserver((records) => {
        dom.resetScroll();
        replacements = /* @__PURE__ */ new WeakMap();
        const messageRows = (node) => node.nodeType === 1 ? [...node.matches(rows) ? [node] : [], ...node.querySelectorAll(rows)] : [];
        liveInserts = /* @__PURE__ */ new WeakSet();
        for (const record of records) {
          if (record.type !== "childList" || !record.addedNodes.length || record.nextSibling !== null || record.previousSibling !== liveTails.get(record.target)?.deref()) continue;
          const added = [...record.addedNodes].flatMap(messageRows);
          added.forEach((row) => liveInserts.add(row));
          if (added.length) liveTails.set(record.target, new WeakRef(added.at(-1)));
        }
        for (const record of records) {
          if (record.type !== "childList" || !record.removedNodes.length || record.removedNodes.length !== record.addedNodes.length) continue;
          const oldRows = [...record.removedNodes].flatMap(messageRows), newRows = [...record.addedNodes].flatMap(messageRows);
          if (oldRows.length !== newRows.length) continue;
          oldRows.forEach((old, index) => {
            const identity2 = identities.get(old);
            if (identity2) replacements.set(newRows[index], identity2);
          });
        }
        const removals = /* @__PURE__ */ new Map();
        for (const record of records) {
          if (record.type !== "childList" || record.removedNodes.length !== 1 || record.addedNodes.length) continue;
          if (!removals.has(record.target)) removals.set(record.target, /* @__PURE__ */ new Map());
          const byPrev = removals.get(record.target);
          if (!byPrev.has(record.previousSibling)) byPrev.set(record.previousSibling, /* @__PURE__ */ new Map());
          byPrev.get(record.previousSibling).set(record.nextSibling, record.removedNodes[0]);
        }
        for (const record of records) {
          if (record.type !== "childList" || record.addedNodes.length !== 1 || record.removedNodes.length) continue;
          const old = removals.get(record.target)?.get(record.previousSibling)?.get(record.nextSibling);
          if (!old) continue;
          const oldRows = messageRows(old), newRows = messageRows(record.addedNodes[0]);
          if (oldRows.length !== newRows.length) continue;
          oldRows.forEach((row, index) => {
            const identity2 = identities.get(row);
            if (identity2) replacements.set(newRows[index], identity2);
          });
        }
        const candidates = /* @__PURE__ */ new Set();
        for (const record of records) {
          if (record.type === "childList" && record.addedNodes.length && [...record.addedNodes].every((node) => node.nodeType === 1 && node.matches(".cz-native-chat-time"))) continue;
          if (record.type === "childList" && !record.addedNodes.length && !record.target.closest(rows)) continue;
          if (record.type === "attributes" && ["class", "style"].includes(record.attributeName) && !record.target.closest(rows)) continue;
          if (record.type !== "childList" || !record.addedNodes.length) candidates.add(record.target);
          for (const node of record.addedNodes) candidates.add(node);
        }
        const ordered = [...candidates].sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
        for (const node of ordered) scan(node);
      });
      releaseObserver = scope.observe(observer);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["alt", "title", "aria-label", "data-role", "data-user-role", "data-user-type", "href", "xlink:href", "src", "srcset", "data-src", "data-srcset", "data-message-id", "data-chat-id", "class", "style", "data-cz-message-time", "data-message-time", "data-timestamp", "data-created-at"] });
      baseline = true;
      try {
        scan(document.body);
      } finally {
        baseline = false;
      }
    }
    function dispose() {
      stop();
      history.clear();
      identities = /* @__PURE__ */ new WeakMap();
      liveTails = /* @__PURE__ */ new WeakMap();
      liveInserts = /* @__PURE__ */ new WeakSet();
      replacements = /* @__PURE__ */ new WeakMap();
      structure = null;
      ownerName = "";
      dom.resetScroll();
      scope.dispose();
    }
    scope.listen(document, "load", (event) => {
      if (filter.enabled && event.target?.matches?.("img")) scan(event.target);
    }, true);
    scope.listen(window, "pagehide", (event) => {
      if (!event.persisted) dispose();
    });
    return { configure, stop, dispose };
  } };
})();
