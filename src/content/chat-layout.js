"use strict";
(() => {
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

  // src/content/chat/power-api.js
  async function fetchBalance(uid, { signal, fetchImpl = fetch } = {}) {
    if (typeof uid !== "string" || !/^[-\w]{1,128}$/.test(uid)) throw Error("채널 ID 확인 필요");
    const response = await fetchImpl(`https://api.chzzk.naver.com/service/v1/channels/${encodeURIComponent(uid)}/log-power`, { method: "GET", credentials: "include", headers: { Accept: "application/json", "Front-Client-Platform-Type": "PC", "Front-Client-Product-Type": "web" }, signal });
    if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? "로그인 필요" : `잔액 조회 HTTP ${response.status}`);
    const data = await response.json(), content = data?.content;
    if (data?.code !== 200 || content?.channelId !== uid || content?.active !== true || !Number.isSafeInteger(content?.amount) || content.amount < 0) throw Error("잔액 응답 확인 필요");
    return content.amount;
  }
  function create({ getUid, onValue, onUnavailable = () => {
  }, fetchImpl = fetch, interval = 3e4 }) {
    const scope = new ResourceScope();
    let started = false, running = false, request = null, cancelWait = null;
    scope.add(() => request?.abort());
    scope.listen(window, "pagehide", () => scope.dispose(), { once: true });
    async function poll() {
      if (scope.isDisposed || running) return;
      const uid = getUid();
      if (!uid) return;
      running = true;
      request = new AbortController();
      const deadline = scope.timeout(() => request?.abort(), 15e3);
      try {
        const amount = await fetchBalance(uid, { signal: request.signal, fetchImpl });
        if (!scope.isDisposed && getUid() === uid) onValue(amount, uid);
      } catch (error) {
        if (!scope.isDisposed && getUid() === uid) onUnavailable(error, uid);
      } finally {
        deadline();
        running = false;
        request = null;
        if (!scope.isDisposed && getUid()) cancelWait = scope.timeout(poll, interval);
      }
    }
    return { start() {
      if (started || scope.isDisposed) return;
      started = true;
      void poll();
    }, refresh() {
      cancelWait?.();
      cancelWait = null;
      void poll();
    }, dispose() {
      scope.dispose();
    } };
  }

  // src/content/chat/power-balance.js
  function readPowerBalance(root) {
    const rows = '[data-chat-message],[class*="chatting_message"],[class*="live_chatting_list_item"],[role="listitem"]';
    const candidates = root.querySelectorAll('[data-log-power-balance],[data-log-power],[aria-label*="통나무"],[title*="통나무"],[class*="log_power"],[class*="logPower"]');
    const values = /* @__PURE__ */ new Set();
    const number = (text) => {
      const raw = String(text || "").trim();
      if (!/^\d+(?:,\d{3})*$/.test(raw)) return null;
      const n = Number(raw.replaceAll(",", ""));
      return Number.isSafeInteger(n) && n >= 0 ? n : null;
    };
    for (const node of [...candidates].slice(0, 60)) {
      if (node.closest("#cz-chat-power," + rows)) continue;
      const label = [node.getAttribute("aria-label"), node.getAttribute("title"), node.textContent].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (/보너스|받기|획득|적립|승부|예측|베팅|사용|후원|bonus|claim|prediction|bet/i.test(label)) continue;
      const explicit = node.getAttribute("data-log-power-balance") ?? node.getAttribute("data-log-power");
      let balance = explicit === null ? null : number(explicit);
      if (balance === null) {
        const text = (node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent || "").replace(/\s+/g, " ").trim();
        const match = text.match(/내\s*통나무(?:\s*파워)?\s*[:：]?\s*([\d,]+)\s*(?:개|점|포인트|보유)?$/);
        if (match) balance = number(match[1]);
      }
      if (balance !== null) values.add(balance);
    }
    if (values.size === 0) {
      const doc = root.ownerDocument || root, found = doc.evaluate(".//text()[contains(.,'통나무')]", root, null, 7, null);
      for (let i = 0; i < Math.min(found.snapshotLength, 512); i++) {
        const node = found.snapshotItem(i);
        let parent = node.parentElement;
        for (let depth = 0; parent && depth < 2; depth++, parent = parent.parentElement) {
          if (parent.closest("#cz-chat-power," + rows)) break;
          const text = parent.textContent.replace(/\s+/g, " ").trim();
          if (text.length > 100) break;
          const match = text.match(/^내\s*통나무\s*파워\s*[:：]?\s*([\d,]+)\s*(?:개|점|포인트)?$/);
          const balance = match ? number(match[1]) : null;
          if (balance !== null) {
            values.add(balance);
            break;
          }
        }
      }
    }
    return values.size === 1 ? [...values][0] : null;
  }

  // src/content/chat/header-style.js
  var headerStyles = `
.cz-chat-only { border:0!important; border-radius:0!important; }
.cz-native-chat-header { display:flex!important; align-items:center!important; justify-content:flex-start!important; gap:8px!important; height:44px!important; min-height:44px!important; max-height:44px!important; padding:4px 8px!important; flex-shrink:0!important; box-sizing:border-box!important; font-family:Arial,"Noto Sans KR",sans-serif!important; font-size:13px!important; color:#ddd!important; background:#171b1f!important; border-bottom:1px solid #343c45!important; }
.cz-channel-name { position:static!important; inset:auto!important; transform:none!important; flex:1 1 0!important; width:auto!important; min-width:0!important; max-width:none!important; font-size:13px!important; font-weight:700!important; line-height:20px!important; color:#f4f6f9!important; text-align:left!important; overflow:hidden!important; text-overflow:ellipsis!important; white-space:nowrap!important; margin:0 auto 0 0!important; padding:0!important; order:-1!important; }
#cz-chat-channel,.cz-native-settings { position:relative!important; inset:auto!important; transform:none!important; display:inline-flex!important; align-items:center!important; justify-content:center!important; align-self:center!important; flex:0 0 32px!important; width:32px!important; min-width:32px!important; max-width:32px!important; height:32px!important; min-height:32px!important; max-height:32px!important; margin:0!important; padding:0!important; border:0!important; border-radius:4px!important; background:transparent!important; color:#d3dae3!important; line-height:0!important; font-size:0!important; float:none!important; vertical-align:middle!important; box-sizing:border-box!important; cursor:pointer; }
#cz-chat-channel:before,#cz-chat-channel:after,.cz-native-settings:before,.cz-native-settings:after { content:none!important; }
#cz-chat-channel:hover,.cz-native-settings:hover { color:#fff!important; background:#ffffff12!important; }
.cz-native-settings > :not(.cz-native-menu-icon) { visibility:hidden!important; }
.cz-native-menu-icon { position:absolute!important; inset:6px!important; width:20px!important; height:20px!important; display:block!important; pointer-events:none!important; visibility:visible!important; }
.cz-native-action-wrapper { position:relative!important; inset:auto!important; transform:none!important; display:flex!important; flex:0 0 auto!important; align-self:center!important; align-items:center!important; justify-content:flex-end!important; gap:4px!important; min-width:0!important; min-height:32px!important; margin:0!important; padding:0!important; }
#cz-chat-power { display:inline-flex!important; align-items:center!important; justify-content:center!important; flex:0 0 auto!important; height:24px!important; max-width:104px!important; gap:4px!important; padding:0 8px!important; margin:0!important; border:1px solid #365447!important; border-radius:4px!important; background:#16271f!important; color:#bfe9d4!important; font-family:Arial,"Noto Sans KR",sans-serif!important; font-size:12px!important; line-height:16px!important; font-weight:600!important; white-space:nowrap!important; box-sizing:border-box!important; }
#cz-chat-power .cz-power-value { min-width:0!important; overflow:hidden!important; text-overflow:ellipsis!important; font-variant-numeric:tabular-nums!important; }
#cz-chat-power[data-known="false"] { color:#acb6c3!important; border-color:#3b424b!important; background:#1e242a!important; }
.cz-native-chat-time { display:inline!important; margin-right:6px!important; color:#a2afbd!important; font-size:10px!important; font-weight:400!important; line-height:inherit!important; white-space:nowrap!important; }
@media(max-width:280px) { .cz-native-chat-header { gap:4px!important; padding-left:8px!important; padding-right:8px!important; } #cz-chat-power .cz-power-label { display:none!important; } #cz-chat-power { max-width:66px!important; } }
`;

  // src/content/chat-layout.js
  globalThis.CZChatLayout = /* @__PURE__ */ (() => {
    function findReplayChatRoot(doc) {
      const markers = Array.from(doc.querySelectorAll("body *")).filter((el) => {
        const text = String(el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text || text.length > 120) return false;
        return /라이브 채팅 다시보기|실시간 채팅 다시보기/i.test(text);
      });
      let best = null;
      for (const marker of markers) {
        let node = marker;
        for (let depth = 0; node && node !== doc.body && depth < 8; depth++, node = node.parentElement) {
          if (!isVisible(node)) continue;
          const rect = node.getBoundingClientRect();
          if (rect.width < 160 || rect.height < 120) continue;
          const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
          let score = 20 - depth * 2;
          if (/라이브 채팅 다시보기|실시간 채팅 다시보기/i.test(text)) score += 12;
          if (node.querySelectorAll("li, [role='listitem']").length >= 3) score += 8;
          if (node.querySelectorAll("button").length >= 1) score += 2;
          if (rect.width > doc.documentElement.clientWidth * 0.95 && rect.height > doc.documentElement.clientHeight * 0.9) score -= 12;
          const area = rect.width * rect.height;
          if (!best || score > best.score || score === best.score && area < best.area) {
            best = { el: node, score, area };
          }
        }
      }
      return best?.el || null;
    }
    function findChatRoot(doc) {
      const selectors = [
        '[class*="live_chat"]',
        '[class*="LiveChat"]',
        '[class*="liveChat"]',
        '[class*="chat_area"]',
        '[class*="chatArea"]',
        '[class*="chat-container"]',
        '[class*="chatContainer"]',
        '[class*="chatting"]',
        '[class*="Chatting"]',
        '[class*="_chat_"]',
        '[class*="chat__"]',
        '[data-testid*="chat"]',
        '[data-test*="chat"]',
        '[id*="chat"]',
        '[id*="Chat"]',
        "aside"
      ];
      const candidates = [];
      for (const selector of selectors) {
        for (const el of doc.querySelectorAll(selector)) {
          if (!isVisible(el)) continue;
          if (el.matches("input,textarea,[contenteditable]") || /(?:input|textbox|composer)/i.test(String(el.className || ""))) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 160 || rect.height < 120) continue;
          let score = 0;
          if (rect.left > doc.documentElement.clientWidth * 0.35) score += 5;
          if (rect.height > 300) score += 2;
          if (el.querySelector("textarea, input, [contenteditable='true']")) score += 8;
          if (el.querySelectorAll("button").length >= 1) score += 2;
          if (/chat|채팅/i.test(`${el.className || ""} ${el.id || ""}`)) score += 4;
          if (el.querySelectorAll("li, [role='listitem']").length >= 3) score += 3;
          candidates.push({ el, score, area: rect.width * rect.height });
        }
      }
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.area - a.area;
      });
      return candidates[0]?.el || null;
    }
    function isVisible(el) {
      const style = el.ownerDocument.defaultView.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
    function prepareChatOnlyFrame(doc, chatRoot) {
      if (location.pathname.endsWith("/chat")) {
        let container = chatRoot;
        while (container) {
          container.classList.add("cz-chat-width");
          if (container === doc.documentElement) break;
          container = container.parentElement;
        }
        if (!doc.getElementById("cz-chat-viewport-width")) {
          const style = doc.createElement("style");
          style.id = "cz-chat-viewport-width";
          style.textContent = ".cz-chat-width{min-width:0!important;max-width:100%!important;box-sizing:border-box!important}html.cz-chat-width,body.cz-chat-width,.cz-chat-only{width:100%!important}.cz-native-chat-header{min-width:0!important;max-width:100%!important}";
          (doc.head || doc.documentElement).appendChild(style);
        }
        chatRoot.style.setProperty("width", "100%", "important");
        doc.querySelectorAll("video").forEach((video) => video.style.setProperty("display", "none", "important"));
        return;
      }
      const ancestors = /* @__PURE__ */ new Set();
      let node = chatRoot;
      while (node && node !== doc.body) {
        ancestors.add(node);
        node = node.parentElement;
      }
      for (const el of Array.from(doc.body.querySelectorAll("*"))) {
        if (el === chatRoot || chatRoot.contains(el) || ancestors.has(el)) continue;
        if (el.matches('video,nav,[class*="video_player"],[class*="VideoPlayer"],[class*="global_header"]')) el.style.setProperty("display", "none", "important");
      }
      doc.documentElement.style.cssText = "margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#111!important;";
      doc.body.style.cssText = "margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#111!important;";
      for (const ancestor of ancestors) {
        ancestor.style.setProperty("position", "static", "important");
        ancestor.style.setProperty("width", "100%", "important");
        ancestor.style.setProperty("height", "100%", "important");
        ancestor.style.setProperty("max-width", "100%", "important");
        ancestor.style.setProperty("max-height", "100%", "important");
        ancestor.style.setProperty("min-width", "0", "important");
        ancestor.style.setProperty("min-height", "0", "important");
        ancestor.style.setProperty("overflow", "hidden", "important");
        ancestor.style.setProperty("box-sizing", "border-box", "important");
        ancestor.style.setProperty("transform", "none", "important");
      }
      for (const el of [doc.documentElement, doc.body, chatRoot]) {
        el.style.setProperty("overflow", "hidden", "important");
        el.style.setProperty("box-sizing", "border-box", "important");
        el.style.setProperty("max-width", "100%", "important");
        el.style.setProperty("max-height", "100%", "important");
      }
      chatRoot.style.setProperty("display", "flex", "important");
      chatRoot.style.setProperty("position", "absolute", "important");
      chatRoot.style.setProperty("inset", "0", "important");
      chatRoot.style.setProperty("width", "100%", "important");
      chatRoot.style.setProperty("height", "100%", "important");
      chatRoot.style.setProperty("max-width", "100%", "important");
      chatRoot.style.setProperty("max-height", "100%", "important");
      chatRoot.style.setProperty("min-width", "0", "important");
      chatRoot.style.setProperty("min-height", "0", "important");
      chatRoot.style.setProperty("box-sizing", "border-box", "important");
      chatRoot.style.setProperty("z-index", "1", "important");
      const silence = () => {
        for (const video of doc.querySelectorAll("video")) {
          video.muted = true;
          video.volume = 0;
          video.pause();
        }
      };
      silence();
      const observer = new MutationObserver(silence);
      observer.observe(doc.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 15e3);
    }
    function stabilizeInput(doc, root) {
      if (!doc.getElementById("cz-chat-input-size")) {
        const style = doc.createElement("style");
        style.id = "cz-chat-input-size";
        style.textContent = ".cz-chat-input-idle{box-sizing:border-box!important;height:46px!important;min-height:46px!important;max-height:46px!important;padding-top:8px!important;padding-bottom:8px!important;align-items:center!important}.cz-chat-input-idle textarea,.cz-chat-input-idle [contenteditable]{box-sizing:border-box!important;min-height:0!important;max-height:28px!important;line-height:24px!important;margin-top:0!important;margin-bottom:0!important}";
        (doc.head || doc.documentElement).appendChild(style);
      }
      root.querySelectorAll('textarea,[contenteditable],input[type="text"],input:not([type])').forEach((input) => {
        const box = input.closest('[class*="chat_input_box"],[class*="chatting_input_box"],[class*="chatInputBox"],[class*="ChatInputBox"],[class*="chat_input_field"],[class*="chatting_input_field"]');
        if (!box || box === root || !root.contains(box)) return;
        const empty = !String(input.value ?? input.textContent ?? "").trim();
        box.classList.toggle("cz-chat-input-idle", empty && !box.contains(doc.activeElement));
      });
    }
    let lastPowerBalance = null, powerChannel = "", powerReader = null, powerApiFresh = false;
    let presentation = { name: "", height: 0 }, onHeader = null, nativeMenuOpen = false;
    const boundRoots = /* @__PURE__ */ new WeakSet();
    function setPresentation(value) {
      presentation = { name: String(value.name || "").slice(0, 160), height: 0 };
      prepare();
    }
    const managedHeaders = /* @__PURE__ */ new WeakSet();
    function isNativeHeader(header) {
      if (managedHeaders.has(header)) return true;
      const title = [...header.querySelectorAll("h1,h2,h3,strong,span,div")].some((el) => !el.children.length && ["채팅", "라이브 채팅 다시보기", "실시간 채팅 다시보기"].includes(el.textContent.trim()));
      const bare = [...header.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim() === "채팅");
      const replay = /^(라이브|실시간) 채팅 다시보기$/.test(header.textContent.trim()) || [...header.querySelectorAll("h1,h2,h3,strong,span")].some((el) => ["라이브 채팅 다시보기", "실시간 채팅 다시보기"].includes(el.textContent.trim()));
      return (title || bare) && (replay ? header.querySelectorAll("button").length >= 1 : /\d+\s*%/.test(header.textContent) && header.querySelectorAll("button").length >= 2);
    }
    function findHeader(scope) {
      const candidates = [...scope.querySelectorAll('.cz-native-chat-header,[class*="live_chatting_header"],[class*="video_chatting_header"],[data-chat-toolbar]')].filter(isNativeHeader);
      const owned = candidates.find((node) => managedHeaders.has(node));
      if (owned) return owned;
      const innermost = candidates.find((node) => !candidates.some((other) => other !== node && node.contains(other)));
      if (innermost) return innermost;
      for (const el of scope.querySelectorAll("h1,h2,h3,strong,span,div")) {
        if (el.children.length || el.textContent.trim() !== "채팅") continue;
        let parent = el.parentElement;
        for (let depth = 0; parent && depth < 3; depth++, parent = parent.parentElement) if (parent.textContent.length < 160 && isNativeHeader(parent)) return parent;
      }
      return null;
    }
    function cleanClonedControls() {
      for (const header of document.querySelectorAll(".cz-native-chat-header")) {
        if (managedHeaders.has(header)) continue;
        header.classList.remove("cz-native-chat-header");
        header.querySelectorAll("#cz-chat-settings,#cz-chat-channel,#cz-chat-power,.cz-native-menu-icon").forEach((el) => el.remove());
        header.querySelectorAll(".cz-channel-name,.cz-native-settings").forEach((el) => el.classList.remove("cz-channel-name", "cz-native-settings"));
      }
    }
    function mountHeaderIcon(host, content) {
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      host.appendChild(icon);
      const shadow = icon.attachShadow({ mode: "open" });
      shadow.innerHTML = '<style>:host{display:block!important;width:20px!important;height:20px!important;flex:none!important;line-height:0!important}svg{display:block;width:20px;height:20px;min-width:20px;max-width:20px;overflow:visible;fill:currentColor;stroke:none;shape-rendering:geometricPrecision;transform:none;filter:none;opacity:1}</style><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' + content + "</svg>";
    }
    function overlayRects() {
      return [...document.querySelectorAll('[role="dialog"],[role="menu"],[aria-modal="true"],[class^="_layer_"],[class*=" _layer_"],[class*="layer_popup"],.cz-native-chat-header div,.cz-native-chat-header ul')].filter((el) => {
        if (el.matches(".cz-chat-only") || el.querySelector(".cz-chat-only")) return false;
        if (!isVisible(el) || !el.children.length && !el.textContent.trim()) return false;
        const style = getComputedStyle(el), rect = el.getBoundingClientRect();
        if (el.closest(".cz-native-chat-header") && !el.matches("[role=dialog],[role=menu]") && (rect.width < 80 || rect.height < 40)) return false;
        return el.matches('[role="dialog"],[role="menu"],[aria-modal="true"]') || ["fixed", "absolute"].includes(style.position);
      }).slice(0, 16).map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      });
    }
    function overlayOpen() {
      return overlayRects().length > 0;
    }
    function reportHeader(header) {
      if (!onHeader) return;
      const rects = overlayRects();
      onHeader(Math.round(header.getBoundingClientRect().bottom), nativeMenuOpen || rects.length > 0, rects);
    }
    function updatePowerBalance(header, balance, title) {
      let badge = header.querySelector("#cz-chat-power");
      if (!badge) {
        badge = document.createElement("span");
        badge.id = "cz-chat-power";
        badge.innerHTML = '<span class="cz-power-label">통나무</span><span class="cz-power-value">—</span>';
        title.after(badge);
      }
      const known = balance !== null || lastPowerBalance !== null;
      const amount = lastPowerBalance?.source === "api" ? lastPowerBalance.value : balance ?? lastPowerBalance?.value;
      const text = known ? amount.toLocaleString("ko-KR") : "—", value = badge.querySelector(".cz-power-value");
      if (value.textContent !== text) value.textContent = text;
      badge.dataset.known = String(known);
      badge.dataset.fresh = String(powerApiFresh || balance !== null);
      badge.title = powerApiFresh ? `내 통나무 파워 ${text} · 30초마다 갱신` : balance !== null && lastPowerBalance?.source !== "api" ? `내 통나무 파워 ${text}` : known ? `마지막 확인 잔액 ${text} · API 재조회 또는 프로필 확인 시 갱신됩니다` : "잔액 조회 중 · 로그인 상태와 원본 프로필을 확인해 주세요";
      badge.setAttribute("aria-label", badge.title);
    }
    function nativeHeader(root) {
      const header = findHeader(root);
      if (!header) return;
      managedHeaders.add(header);
      header.classList.add("cz-native-chat-header");
      if (!boundRoots.has(root)) {
        boundRoots.add(root);
        root.addEventListener("click", (event) => {
          const control = event.target.closest?.("button,[role=button]");
          if (control?.id === "cz-chat-settings" || event.target.closest?.("#cz-chat-channel")) return;
          const current = root.querySelector(".cz-native-chat-header");
          nativeMenuOpen = !!(control && current?.contains(control) && !nativeMenuOpen);
          if (current) reportHeader(current);
        });
        root.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            nativeMenuOpen = false;
            const current = root.querySelector(".cz-native-chat-header");
            if (current) reportHeader(current);
          }
        });
      }
      const channelKey = location.pathname.replace(/\/chat\/?$/, "");
      if (channelKey !== powerChannel) {
        powerChannel = channelKey;
        lastPowerBalance = null;
        powerApiFresh = false;
      }
      const balance = readPowerBalance(document);
      if (balance !== null && !powerApiFresh) lastPowerBalance = { value: balance, source: "profile" };
      const currentTitle = header.querySelector(".cz-channel-name");
      if (currentTitle) updatePowerBalance(header, balance, currentTitle);
      if (nativeMenuOpen || overlayOpen()) {
        reportHeader(header);
        return;
      }
      let title = header.querySelector(".cz-channel-name");
      if (!title) {
        const original = header.querySelector('[class*="header_title"],[class*="header_name"],h1,h2,h3');
        if (original && !original.querySelector("button,input,select")) original.style.setProperty("display", "none", "important");
        title = document.createElement("strong");
        title.className = "cz-channel-name";
        header.prepend(title);
      }
      if (title.textContent !== presentation.name) title.textContent = presentation.name;
      title.title = presentation.name;
      updatePowerBalance(header, balance, title);
      header.querySelectorAll('[class*="font_size"],[class*="fontSize"],[class*="font-size"],[class*="header_font"],[class*="zoom"],[aria-label*="글씨"],[aria-label*="글자"],[title*="글씨"],[title*="글자"]').forEach((el) => el.style.setProperty("display", "none", "important"));
      for (const el of header.querySelectorAll("*")) {
        if (el === title || el.contains(title) || el.closest("#cz-chat-settings")) continue;
        const text = el.textContent.trim();
        if (!el.children.length && text === "채팅") el.style.setProperty("display", "none", "important");
        if ((/^\d+\s*%$/.test(text) || /^[+−–-]$/.test(text)) && !el.querySelector("button")) {
          const control = el.closest("button") || el;
          control.style.setProperty("display", "none", "important");
        }
      }
      for (const node of [...header.childNodes]) if (node.nodeType === 3 && /채팅/.test(node.textContent)) node.textContent = "";
      const native = header.querySelector(".cz-native-settings") || [...header.querySelectorAll("button")].filter((el) => el.id !== "cz-chat-settings").at(-1);
      for (const value of header.querySelectorAll("*")) {
        if (value.children.length || !/^\d+\s*%$/.test(value.textContent.trim())) continue;
        for (const adjacent of [value.previousElementSibling, value.nextElementSibling]) if (adjacent?.matches("button") && adjacent !== native) adjacent.style.setProperty("display", "none", "important");
      }
      header.querySelector("#cz-chat-settings")?.remove();
      let channel = header.querySelector("#cz-chat-channel");
      if (!channel) {
        channel = document.createElement("a");
        channel.id = "cz-chat-channel";
        channel.target = "_blank";
        channel.rel = "noopener noreferrer";
        channel.title = "현재 채널 열기";
        channel.setAttribute("aria-label", "현재 채널 열기");
        mountHeaderIcon(channel, '<path d="M10 1h5v5h-1.5V3.56L7.53 9.53 6.47 8.47l5.97-5.97H10V1ZM2.5 3H7v1.5H2.5v9h9V9H13v4.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 1 13.5v-9A1.5 1.5 0 0 1 2.5 3Z"/>');
        if (native) native.before(channel);
        else header.appendChild(channel);
      }
      channel.href = location.origin + location.pathname.replace(/\/chat\/?$/, "");
      if (native) {
        native.classList.add("cz-native-settings");
        if (!native.getAttribute("aria-label")) native.setAttribute("aria-label", "치지직 채팅 설정");
        if (!native.querySelector(".cz-native-menu-icon")) {
          const icon = document.createElement("span");
          icon.className = "cz-native-menu-icon";
          mountHeaderIcon(icon, '<circle cx="8" cy="3" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="8" cy="13" r="1.25"/>');
          native.appendChild(icon);
        }
        let wrapper = native.parentElement;
        while (wrapper && wrapper !== header) {
          wrapper.classList.add("cz-native-action-wrapper");
          wrapper = wrapper.parentElement;
        }
      }
      root.querySelector("#cz-important-chat-space")?.remove();
      const height = Math.round(header.getBoundingClientRect().bottom);
      if (height >= 24) reportHeader(header);
    }
    const timestampRows = '[class*="live_chatting_list_item"],[data-chat-message],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
    let timestampRoot = null, timestampObserver = null, timestampsEnabled = false;
    function setTimestamps(on) {
      timestampsEnabled = on === true;
      timestampObserver?.disconnect();
      timestampObserver = null;
      timestampRoot = null;
      if (!timestampsEnabled) document.querySelectorAll(".cz-native-chat-time").forEach((node) => node.remove());
      else if (preparedRoot) stampMessages(preparedRoot);
    }
    function stampMessages(root) {
      if (!timestampsEnabled || timestampRoot === root) return;
      timestampObserver?.disconnect();
      timestampRoot = root;
      const stamp = (row) => {
        const own = row.querySelector(".cz-native-chat-time");
        if (row.querySelector("time:not(.cz-native-chat-time)") || row.querySelector(timestampRows)) {
          own?.remove();
          return;
        }
        const raw = row.getAttribute("data-cz-message-time") || row.getAttribute("data-message-time") || row.getAttribute("data-timestamp") || row.getAttribute("data-created-at");
        const parsed = CZImportantChat.timestamp(raw);
        if (parsed === null) {
          own?.remove();
          return;
        }
        const date = new Date(parsed), iso = date.toISOString();
        if (own?.dateTime === iso) return;
        const time = own || document.createElement("time");
        time.className = "cz-native-chat-time";
        time.dateTime = iso;
        time.textContent = date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
        time.title = "원본 메시지 작성 시각";
        if (!own) row.prepend(time);
      };
      const scan = (node) => {
        if (node.nodeType !== 1 || node.matches(".cz-native-chat-time")) return;
        if (node.matches(timestampRows)) stamp(node);
        node.querySelectorAll(timestampRows).forEach(stamp);
      };
      root.querySelectorAll(timestampRows).forEach(stamp);
      timestampObserver = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === "attributes") {
            if (record.target.matches(timestampRows)) stamp(record.target);
            continue;
          }
          for (const node of record.addedNodes) scan(node);
        }
      });
      timestampObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-cz-message-time", "data-message-time", "data-timestamp", "data-created-at"] });
    }
    let preparedRoot = null, preparedRootStyle = "";
    function prepare() {
      cleanClonedControls();
      const replay = location.pathname.startsWith("/video/");
      let root = preparedRoot?.isConnected ? preparedRoot : replay ? findReplayChatRoot(document) || findChatRoot(document) : findChatRoot(document);
      if (!root) return false;
      const header = findHeader(document);
      if (header && !root.contains(header)) {
        let common = root.parentElement;
        while (common && !common.contains(header)) common = common.parentElement;
        if (common && (location.pathname.endsWith("/chat") || common.getBoundingClientRect().width <= root.getBoundingClientRect().width + 40)) root = common;
      }
      if (root !== preparedRoot) {
        if (preparedRoot?.isConnected) preparedRoot.style.cssText = preparedRootStyle;
        preparedRootStyle = root.style.cssText;
        prepareChatOnlyFrame(document, root);
        preparedRoot = root;
      }
      root.classList.add("cz-chat-only");
      if (!document.getElementById("cz-chat-chrome")) {
        const style = document.createElement("style");
        style.id = "cz-chat-chrome";
        style.textContent = headerStyles;
        (document.head || document.documentElement).appendChild(style);
      }
      nativeHeader(root);
      stampMessages(root);
      if (overlayOpen()) root.querySelectorAll(".cz-chat-input-idle").forEach((el) => el.classList.remove("cz-chat-input-idle"));
      else stabilizeInput(document, root);
      return true;
    }
    function start(options = {}) {
      onHeader = options.onHeader || onHeader;
      const apply = () => {
        document.querySelectorAll("video").forEach((v) => {
          v.muted = true;
          v.volume = 0;
          try {
            v.pause();
          } catch (_) {
          }
        });
        prepare();
      };
      apply();
      if (!powerReader) {
        const getUid = () => location.pathname.match(/^\/live\/([-\w]+)(?:\/chat)?\/?$/)?.[1] || null;
        powerReader = create({ getUid, onValue: (amount) => {
          powerApiFresh = true;
          lastPowerBalance = { value: amount, source: "api" };
          prepare();
        }, onUnavailable: () => {
          powerApiFresh = false;
          prepare();
        } });
        powerReader.start();
      }
      let scheduled = false;
      const report = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          const header = document.querySelector(".cz-native-chat-header");
          if (header) reportHeader(header);
        });
      };
      window.addEventListener("resize", report);
      document.addEventListener("scroll", report, true);
      const overlays = onHeader ? new MutationObserver(report) : null;
      overlays?.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "open", "aria-hidden", "aria-expanded"] });
      document.addEventListener("click", (event) => {
        const header = document.querySelector(".cz-native-chat-header");
        if (header && !header.contains(event.target)) nativeMenuOpen = false;
        report();
      }, true);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          nativeMenuOpen = false;
          report();
        }
      }, true);
      window.addEventListener("pagehide", () => {
        overlays?.disconnect();
        timestampObserver?.disconnect();
      }, { once: true });
      document.addEventListener("focusin", apply);
      document.addEventListener("focusout", () => queueMicrotask(apply));
      document.addEventListener("input", apply);
      setInterval(apply, 1e3);
    }
    return { start, setPresentation, setTimestamps };
  })();
})();
