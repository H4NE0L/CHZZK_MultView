"use strict";
(() => {
  // src/shared/chat/roles.ts
  var nameKey = (value) => String(value || "").normalize("NFC").trim().toLocaleLowerCase("ko-KR");

  // src/content/chat/target-menu.js
  function createTargetMenu({ send }) {
    let filter = { names: [], excludedNames: [] }, disposed = false, clicked = "", clickedAt = 0;
    const buttons = /* @__PURE__ */ new Map();
    const text = (node) => String(node?.textContent || "").normalize("NFC").replace(/\s+/g, " ").trim();
    const author = (node) => {
      const copy = node.cloneNode(true);
      copy.querySelectorAll("img,svg,[hidden],[aria-hidden=true],[class*=blind i],[class*=badge i]").forEach((node2) => node2.remove());
      return text(copy);
    };
    const tracked = (name) => filter.names.some((value) => nameKey(value) === nameKey(name)) && !filter.excludedNames.some((value) => nameKey(value) === nameKey(name));
    function paint(button, name) {
      button.disabled = false;
      button.setAttribute("aria-pressed", String(tracked(name)));
      const label = tracked(name) ? "자동 수집 대상 삭제" : "자동 수집 대상 추가";
      if (button.textContent !== label) button.textContent = label;
      button.title = name + " · 수동 수집 목록 관리";
    }
    const rows = '[data-chat-message],[class*="live_chatting_list_item"],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
    const names = '[class*="name_text"],[data-chat-nickname],[class*="live_chatting_username_nickname"],[class^="_nickname_"],[class*=" _nickname_"]';
    function markRow(row) {
      if (row.querySelector(rows)) return;
      const nickname = [...row.querySelectorAll(names)].find((node) => !node.querySelector(names));
      const own = row.querySelector(".cz-native-target-dot");
      if (!nickname || !tracked(author(nickname))) {
        own?.remove();
        return;
      }
      const dot = own || document.createElement("span");
      if (!own) {
        dot.className = "cz-native-target-dot";
        dot.title = "자동 수집 대상";
        dot.setAttribute("aria-hidden", "true");
      }
      const time = row.querySelector(".cz-native-chat-time"), parent = time?.parentElement || row, previous = time || null;
      if (dot.parentElement !== parent || dot.previousSibling !== previous) parent.insertBefore(dot, previous ? previous.nextSibling : parent.firstChild);
    }
    function markMessages(node) {
      if (node.nodeType !== 1) node = node.parentElement;
      if (!node || node.closest("[data-cz-collection-profile]")) return;
      const row = node.closest(rows);
      if (row) markRow(row);
      else node.querySelectorAll(rows).forEach(markRow);
    }
    function profileName(panel) {
      const heading = [...panel.querySelectorAll("[data-profile-nickname],[class*=nickname],strong,h2,h3")].find((node) => text(node) && !node.querySelector("[class*=nickname]"));
      return heading ? author(heading) : "";
    }
    function scan(node) {
      if (disposed) return;
      for (const [button, entry] of buttons) {
        if (!button.isConnected) {
          buttons.delete(button);
          continue;
        }
        const current = profileName(entry.panel);
        if (current && current.length <= 40 && current !== entry.name) {
          entry.name = current;
          paint(button, current);
        }
      }
      if (node.nodeType !== 1) node = node.parentElement;
      if (!node || node.closest("[data-chat-message],[class*=chatting_message],[class*=live_chatting_list_item]")) return;
      const actions = [...node.matches?.("button,a,[role=menuitem],[role=button]") ? [node] : [], ...node.querySelectorAll("button,a,[role=menuitem],[role=button]")].filter((action) => /^(?:메시지\s*신고|사용자\s*차단)$/.test(text(action)));
      for (const action of actions) {
        let panel = action.parentElement;
        for (let depth = 0; panel && panel !== document.body && depth < 7; depth++, panel = panel.parentElement) {
          const existing = panel.querySelector("[data-cz-collection-target]");
          if (existing) {
            if (buttons.has(existing)) break;
            existing.remove();
          }
          if (panel.querySelector("[data-chat-message],[class*=chatting_message],[class*=live_chatting_list_item]")) break;
          const controls = [...panel.querySelectorAll("button,a,[role=menuitem],[role=button]")];
          if (!controls.some((node2) => /^메시지\s*신고$/.test(text(node2))) || !controls.some((node2) => /^사용자\s*차단$/.test(text(node2)))) continue;
          const heading = [...panel.querySelectorAll("[data-profile-nickname],[class*=nickname],strong,h2,h3")].find((node2) => text(node2) && !node2.querySelector("[class*=nickname]"));
          const name = heading ? author(heading) : Date.now() - clickedAt < 1500 ? clicked : "";
          if (!name || name.length > 40) continue;
          if (!heading && panel.parentElement?.querySelector("strong,h2,h3,[class*=nickname]")) continue;
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute("data-cz-collection-target", "");
          button.style.cssText = "display:flex;align-items:center;width:100%;box-sizing:border-box;padding:12px 16px;margin:0;border:0;border-top:1px solid #3b3d42;background:transparent;color:#fffafa;font:inherit;text-align:left;cursor:pointer";
          panel.setAttribute("data-cz-collection-profile", "");
          const entry = { name, panel };
          buttons.set(button, entry);
          paint(button, name);
          button.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            button.disabled = true;
            try {
              send({ type: "IMPORTANT_CHAT_TARGET_TOGGLE", name: entry.name, add: !tracked(entry.name) });
            } catch (_) {
              paint(button, entry.name);
            }
          };
          let menu = action.parentElement;
          while (menu && menu !== panel && !controls.every((control) => menu.contains(control))) menu = menu.parentElement;
          menu = menu || panel;
          if (menu.matches("ul,ol")) {
            const item = document.createElement("li");
            item.append(button);
            menu.append(item);
          } else menu.append(button);
          break;
        }
      }
    }
    const click = (event) => {
      const nickname = event.target.closest?.('[data-chat-nickname],[class*="_nickname_"],[class*="live_chatting_username_nickname"]');
      if (nickname) {
        clicked = author(nickname);
        clickedAt = Date.now();
      }
    };
    document.addEventListener("click", click, true);
    const observer = new MutationObserver((records) => {
      for (const [button] of buttons) if (!button.isConnected) buttons.delete(button);
      const nodes = /* @__PURE__ */ new Set();
      for (const record of records) {
        if (record.type === "childList") for (const node of record.addedNodes) nodes.add(node);
        else nodes.add(record.target);
      }
      for (let node of nodes) {
        markMessages(node);
        if (node.nodeType !== 1) node = node.parentElement;
        if (!node || node.closest("[data-chat-message],[class*=chatting_message],[class*=live_chatting_list_item]")) continue;
        for (let depth = 0; node && node !== document.body && depth < 5; depth++, node = node.parentElement) scan(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    function dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      document.querySelectorAll(".cz-native-target-dot").forEach((node) => node.remove());
      document.removeEventListener("click", click, true);
      for (const [button, entry] of buttons) {
        entry.panel.removeAttribute("data-cz-collection-profile");
        if (button.parentElement?.matches("li") && button.parentElement.childNodes.length === 1) button.parentElement.remove();
        else button.remove();
      }
      buttons.clear();
    }
    window.addEventListener("pagehide", dispose, { once: true });
    return { configure(settings) {
      filter = settings;
      markMessages(document.body);
      for (const [button, entry] of buttons) {
        if (button.isConnected) paint(button, entry.name);
        else buttons.delete(button);
      }
      scan(document.body);
    }, dispose };
  }

  // src/content/power-rewards.js
  function create({ findVideo }) {
    let enabled = false, disposed = false, timer = null, attempts = 0;
    const pressed = /* @__PURE__ */ new WeakMap();
    function scan() {
      if (!enabled || disposed) return;
      const video = findVideo();
      if (video && !video.paused && !video.ended && video.readyState >= 2) {
        for (const button of [...document.querySelectorAll('button,[role="button"]')].slice(-600)) {
          if (button.closest('[data-chat-message],[class*="chatting_message"],[class*="live_chatting_list_item"]')) continue;
          const label = [button.getAttribute("aria-label"), button.getAttribute("title"), button.textContent].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
          const ready = !button.disabled && button.getAttribute("aria-disabled") !== "true" && !button.closest('[hidden],[aria-hidden="true"]') && /통나무|log.?power/i.test(label + " " + (button.closest('[class*="log_power"],[class*="logPower"],[data-log-power]')?.className || "")) && /받기|수령|획득|claim/i.test(label) && !/승부|예측|베팅|구매|사용|후원|참여|prediction|bet|buy/i.test(label);
          if (!ready) {
            pressed.delete(button);
            continue;
          }
          const signature = button.getAttribute("data-reward-id") || label;
          if (pressed.get(button) === signature) continue;
          pressed.set(button, signature);
          attempts++;
          try {
            button.click();
          } catch (_) {
          }
        }
      }
      document.documentElement.setAttribute("data-cz-power-rewards", JSON.stringify({ enabled, attempts, chatMounted: !!document.querySelector('[class*="live_chat"],[class*="chat_area"],[class*="chatting"]') }));
      timer = setTimeout(() => {
        timer = null;
        scan();
      }, 5e3);
    }
    function configure(on) {
      if (disposed || enabled === (on === true)) return;
      enabled = on === true;
      clearTimeout(timer);
      timer = null;
      if (enabled) scan();
      else document.documentElement.removeAttribute("data-cz-power-rewards");
    }
    function dispose() {
      if (disposed) return;
      configure(false);
      disposed = true;
    }
    window.addEventListener("pagehide", dispose, { once: true });
    return { configure, dispose, get enabled() {
      return enabled;
    } };
  }

  // src/content/chzzk-frame.js
  (() => {
    if (window.top === window) return;
    let PARENT_ORIGIN = chrome.runtime.getURL("").replace(/\/$/, "");
    let chatLayoutStarted = false, timestampsEnabled = false, timestampReaderRequested = false;
    function configureTimestamps(on) {
      timestampsEnabled = on === true;
      document.documentElement.setAttribute("data-cz-timestamps-enabled", String(timestampsEnabled));
      document.dispatchEvent(new Event("cz-chat-timestamps-config"));
      CZChatLayout.setTimestamps(timestampsEnabled);
      if (timestampsEnabled && !timestampReaderRequested) {
        timestampReaderRequested = true;
        chrome.runtime.sendMessage({ type: "CHAT_METADATA_INIT" }).then((result) => {
          if (!result?.ok) timestampReaderRequested = false;
        }).catch((error) => {
          timestampReaderRequested = false;
          console.warn("원본 채팅 시각 읽기 초기화 실패:", error);
        });
      }
    }
    let videoObserver = null;
    let uiObserver = null;
    let chatMode = new URLSearchParams(location.search).get("multiview") === "chat" || new URLSearchParams(location.search).get("multiview") === "1" && location.pathname.endsWith("/chat");
    const frameUid = (() => {
      const m = location.pathname.match(/^\/live\/([^/?#]+)/);
      if (m) return m[1];
      const replay = location.pathname.match(/^\/video\/([^/?#]+)/);
      return replay ? `video:${replay[1]}` : null;
    })();
    if (!frameUid) return;
    if (location.ancestorOrigins?.[0] !== PARENT_ORIGIN) {
      if (location.ancestorOrigins?.[0] !== "https://chzzk.naver.com" || window.parent !== window.top) return;
      try {
        const root = window.parent.document.getElementById("__chzzk_multiview_v09__")?.shadowRoot;
        if (!root || !Array.from(root.querySelectorAll("iframe")).some((frame) => frame.contentWindow === window)) return;
      } catch (_) {
        return;
      }
      PARENT_ORIGIN = "https://chzzk.naver.com";
    }
    if (!chatMode) {
      document.documentElement.setAttribute("data-cz-playback-trace", "true");
      document.dispatchEvent(new Event("cz-playback-trace-enable"));
    }
    function findVideo() {
      return document.querySelector("video");
    }
    function isVideoMuted(video) {
      if (!video) return true;
      return video.muted === true || Number(video.volume) <= 0;
    }
    function reportVideoState(video, reason = "player", operation = "volume") {
      if (!frameUid || !video || chatMode) return;
      window.parent.postMessage({
        source: "chzzk-multiview",
        type: "VIDEO_STATE",
        uid: frameUid,
        muted: isVideoMuted(video),
        volume: Number(video.volume),
        reason,
        operation
      }, PARENT_ORIGIN);
    }
    const audio = CZPlayerAudio.create({ findVideo, report: reportVideoState });
    const setMuted = audio.setMuted, setVolume = audio.setVolume;
    function bindVideo(video) {
      if (!video || video.dataset.chzzkMvBound === "1") return;
      video.dataset.chzzkMvBound = "1";
      if (!chatMode) {
        audio.bind(video);
        for (const event of ["loadeddata", "playing"]) video.addEventListener(event, scheduleTheater);
      }
      if (!chatMode) window.parent.postMessage({ source: "chzzk-multiview", type: "PLAYER_READY", uid: frameUid }, PARENT_ORIGIN);
    }
    function bindObserver() {
      if (videoObserver || !document.documentElement) return;
      videoObserver = new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          const controls = '.pzp-pc__viewmode-button,button[aria-label*="넓은"],button[title*="넓은"],video';
          if (autoWide && !theaterApplied && (node.matches(controls) || node.querySelector(controls))) scheduleTheater();
          if (node.matches("video")) bindVideo(node);
          else node.querySelectorAll("video").forEach(bindVideo);
        }
      });
      videoObserver.observe(document.documentElement, { childList: true, subtree: true });
      document.querySelectorAll("video").forEach(bindVideo);
    }
    function setHidden(el, hidden) {
      if (!el) return;
      el.style.setProperty("display", hidden ? "none" : "", "important");
    }
    function preventFrameScrollbars() {
      if (!document.documentElement || !document.body) return;
      document.documentElement.style.setProperty("width", "100%", "important");
      document.documentElement.style.setProperty("height", "100%", "important");
      document.documentElement.style.setProperty("margin", "0", "important");
      document.documentElement.style.setProperty("padding", "0", "important");
      document.documentElement.style.setProperty("overflow", "hidden", "important");
      document.body.style.setProperty("width", "100%", "important");
      document.body.style.setProperty("height", "100%", "important");
      document.body.style.setProperty("margin", "0", "important");
      document.body.style.setProperty("padding", "0", "important");
      document.body.style.setProperty("overflow", "hidden", "important");
      document.body.style.setProperty("box-sizing", "border-box", "important");
    }
    function setNavVisible(visible) {
      document.documentElement.classList.toggle("chzzk-mv-hide-nav", !visible);
      document.body?.classList.toggle("chzzk-mv-hide-nav", !visible);
      preventFrameScrollbars();
    }
    function hideChat() {
      const selectors = [
        '[class*="live_chat"]',
        '[class*="LiveChat"]',
        '[class*="chat_area"]',
        '[class*="chatArea"]',
        '[class*="chat-container"]',
        '[class*="chatContainer"]',
        '[class*="chatting"]',
        '[class*="Chatting"]',
        '[id*="chat"]',
        '[id*="Chat"]'
      ];
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (el === document.body || el === document.documentElement) continue;
          setHidden(el, true);
        }
      }
    }
    function showChat() {
    }
    const SYNC_EDGE_MARGIN = 0.3;
    const SYNC_START_MARGIN = 0.2;
    function seekRange(video) {
      const pick = (ranges) => ranges && ranges.length ? [ranges.start(0), ranges.end(ranges.length - 1)] : null;
      try {
        return pick(video.seekable) || pick(video.buffered);
      } catch (_) {
        return null;
      }
    }
    function currentDelay(video) {
      const range = seekRange(video);
      if (!range) return null;
      const delay = range[1] - video.currentTime;
      return Number.isFinite(delay) ? Math.max(0, delay) : null;
    }
    function seekBy(delta, latest = false) {
      const video = findVideo();
      if (!video) return { ok: false, reason: "no-video" };
      const range = seekRange(video);
      if (!range) return { ok: false, reason: "not-seekable" };
      const [start, end] = range;
      const now = video.currentTime;
      if (latest) delta = Math.max(0, end - SYNC_EDGE_MARGIN - now);
      const upper = Math.max(now, end - SYNC_EDGE_MARGIN);
      const lower = Math.min(now, start + SYNC_START_MARGIN);
      let target = Math.min(Math.max(now + delta, lower), upper);
      const ranges = video.seekable?.length ? video.seekable : video.buffered;
      if (ranges?.length) {
        const segments = Array.from({ length: ranges.length }, (_, i) => [ranges.start(i), ranges.end(i)]);
        if (!segments.some(([a, b]) => target >= a && target <= b)) {
          const edges = segments.flatMap(([a, b]) => [a + 0.05, b - 0.05]);
          target = edges.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best, edges[0]);
        }
      }
      let applied = target - now;
      if (Math.abs(applied) < 5e-3) applied = 0;
      if (applied !== 0) {
        try {
          video.currentTime = target;
        } catch (_) {
          return { ok: false, reason: "seek-failed" };
        }
      }
      return {
        ok: true,
        applied,
        requested: delta,
        clamped: Math.abs(applied - delta) > 0.02,
        delay: Math.max(0, end - (applied !== 0 ? target : now))
      };
    }
    function reportSyncState() {
      if (!frameUid || chatMode) return;
      const video = findVideo();
      if (!video) return;
      window.parent.postMessage({
        source: "chzzk-multiview",
        type: "SYNC_STATE",
        uid: frameUid,
        delay: currentDelay(video),
        canSeek: !!seekRange(video)
      }, PARENT_ORIGIN);
    }
    const media = CZMediaFrame.create({ chatOnly: chatMode, uid: frameUid, findVideo, seekRange, seekBy, send: (data) => window.parent.postMessage({ source: "chzzk-multiview", ...data }, PARENT_ORIGIN) });
    const syncTimer = setInterval(reportSyncState, 1e3);
    const powerRewards = chatMode ? null : create({ findVideo });
    let theaterApplied = false, autoWide = true;
    let theaterTimer = null;
    function theaterLabel(el) {
      return [el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("data-tooltip"), el.textContent, el.querySelector("svg title")?.textContent, ...String(el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent)].filter(Boolean).join(" ").trim();
    }
    function getTheaterButton() {
      const buttons = Array.from(document.querySelectorAll(
        '.pzp-pc__viewmode-button, button, [role="button"]'
      ));
      const native = document.querySelector(".pzp-pc__viewmode-button");
      if (native) return native;
      return buttons.find((el) => {
        if (el.closest('[data-chat-message],[class*="chatting_message"],[class*="live_chatting_list_item"]')) return false;
        const text = theaterLabel(el);
        return /넓은\s*화면|극장|theater|cinema/i.test(text) || el.matches(".pzp-pc__viewmode-button");
      }) || null;
    }
    function isWideModeButton(button) {
      if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return false;
      const text = theaterLabel(button);
      if (/기본 화면|일반 화면|원래 화면|나가기|exit/i.test(text)) return false;
      if (button.getAttribute("aria-pressed") === "true" || button.closest('.pzp-pc--viewmode-wide,[data-viewmode="wide"]')) return false;
      return /넓은\s*화면|극장|theater|cinema/i.test(text) || !!button.closest('.pzp-pc--viewmode-normal,[data-viewmode="normal"]');
    }
    function pressTheaterShortcut() {
      if (chatMode || !autoWide || theaterApplied) return false;
      const video = findVideo();
      if (!video || video.ended || video.readyState < 2) return false;
      const button = getTheaterButton();
      if (!button) return false;
      if (!isWideModeButton(button)) return false;
      try {
        button.click();
        theaterApplied = true;
        return true;
      } catch (_) {
        return false;
      }
    }
    function scheduleTheater() {
      if (chatMode || !autoWide || theaterApplied || theaterTimer) return;
      const video = findVideo();
      if (!video || video.ended || video.readyState < 2 || !getTheaterButton()) return;
      let tries = 0;
      theaterTimer = setInterval(() => {
        tries++;
        if (pressTheaterShortcut()) {
          clearInterval(theaterTimer);
          theaterTimer = null;
          hideChat();
          return;
        }
        const video2 = findVideo();
        if (video2?.readyState >= 2) {
          const button = getTheaterButton();
          if (button && /기본\s*화면|일반\s*화면|원래\s*화면|exit/i.test(theaterLabel(button))) {
            theaterApplied = true;
            clearInterval(theaterTimer);
            theaterTimer = null;
            hideChat();
            return;
          }
        }
        if (tries >= 20) {
          clearInterval(theaterTimer);
          theaterTimer = null;
        }
      }, 500);
    }
    const importantCollector = chatMode ? CZChatCollector.create({ status: (stats) => window.parent.postMessage({ source: "chzzk-multiview", type: "IMPORTANT_CHAT_STATUS", uid: frameUid, stats }, PARENT_ORIGIN), send: (messages) => window.parent.postMessage({ source: "chzzk-multiview", type: "IMPORTANT_CHAT_BATCH", uid: frameUid, messages }, PARENT_ORIGIN) }) : null;
    const targetMenu = chatMode ? createTargetMenu({ send: (data) => window.parent.postMessage({ source: "chzzk-multiview", uid: frameUid, ...data }, PARENT_ORIGIN) }) : null;
    bindObserver();
    if (chatMode) window.parent.postMessage({ source: "chzzk-multiview", type: "CHAT_READY", uid: frameUid }, PARENT_ORIGIN);
    let disposing = false;
    window.addEventListener("message", (event) => {
      if (!CZMessages.isParentCommand(event, PARENT_ORIGIN, window.parent)) return;
      if (disposing) return;
      if (event.data.type === "PLAYER_DISPOSE") {
        disposing = true;
        const before = audio.snapshot();
        videoObserver?.disconnect();
        uiObserver?.disconnect();
        clearInterval(syncTimer);
        clearInterval(theaterTimer);
        audio.dispose();
        powerRewards?.dispose();
        media?.dispose();
        window.parent.postMessage({ source: "chzzk-multiview", type: "PLAYER_DISPOSED", uid: frameUid, requestId: event.data.requestId, details: { before, releaseMode: "frame-detach" } }, PARENT_ORIGIN);
        return;
      }
      if (event.data.type === "PLAYER_OPTIONS" && !chatMode) {
        const next = event.data.autoWide !== false;
        if (next !== autoWide) {
          autoWide = next;
          if (!autoWide) {
            clearInterval(theaterTimer);
            theaterTimer = null;
          } else {
            theaterApplied = false;
            scheduleTheater();
          }
        }
      }
      if (event.data.type === "POWER_REWARDS_CONFIG" && powerRewards) {
        powerRewards.configure(event.data.enabled);
      }
      if (event.data.type === "POWER_DIAGNOSTICS" && !chatMode) chrome.runtime.sendMessage({ type: "POWER_DIAGNOSTICS" }).then((result) => window.parent.postMessage({ source: "chzzk-multiview", type: "POWER_DIAGNOSTICS_RESULT", uid: frameUid, requestId: event.data.requestId, ...result?.ok ? { diagnostics: { ...result.diagnostics, audio: audio.snapshot() } } : { error: result?.error || "점검 실행 실패" } }, PARENT_ORIGIN)).catch((error) => window.parent.postMessage({ source: "chzzk-multiview", type: "POWER_DIAGNOSTICS_RESULT", uid: frameUid, requestId: event.data.requestId, error: String(error) }, PARENT_ORIGIN));
      if (event.data.type === "CHAT_TIMESTAMP_CONFIG" && chatMode) configureTimestamps(event.data.enabled);
      if (event.data.type === "CHAT_PRESENTATION" && chatMode) CZChatLayout.setPresentation(event.data);
      if (event.data.type === "IMPORTANT_CHAT_CONFIG" && chatMode) {
        importantCollector?.configure(event.data.settings, { streamerName: event.data.streamerName, since: event.data.since });
        targetMenu?.configure(CZImportantChat.settings(event.data.settings));
      }
      if (event.data.type.startsWith("MEDIA_") && (!chatMode || event.data.type === "MEDIA_SHORTCUTS")) media?.command(event.data);
      if (event.data.type === "SET_NAV_VISIBLE") setNavVisible(!!event.data.visible);
      if (event.data.type === "SET_CHAT_MODE") {
        chatMode = !!event.data.visible;
        if (chatMode && !chatLayoutStarted) {
          chatLayoutStarted = true;
          preventFrameScrollbars();
          CZChatLayout.start();
          CZChatLayout.setTimestamps(timestampsEnabled);
        }
      }
      if (event.data.type === "SET_CHAT_VISIBLE") event.data.visible ? showChat() : hideChat();
      if (event.data.type === "SET_MUTED") setMuted(!!event.data.muted);
      if (event.data.type === "SET_VOLUME") setVolume(event.data.volume, typeof event.data.muted === "boolean" ? event.data.muted : null);
      if (event.data.type === "ENTER_THEATER" && !chatMode) {
        preventFrameScrollbars();
        scheduleTheater();
      }
      if (event.data.type === "SYNC_SEEK" && frameUid && !chatMode) {
        const delta = Number(event.data.delta);
        const result = Number.isFinite(delta) ? seekBy(delta, event.data.latest === true) : { ok: false, reason: "bad-delta" };
        window.parent.postMessage({
          source: "chzzk-multiview",
          type: "SYNC_RESULT",
          uid: frameUid,
          requestId: event.data.requestId,
          ...result
        }, PARENT_ORIGIN);
        reportSyncState();
      }
    });
    const style = document.createElement("style");
    style.textContent = `
    html.chzzk-mv-hide-nav body > header,
    html.chzzk-mv-hide-nav [class*="Header"],
    html.chzzk-mv-hide-nav [class*="header"],
    html.chzzk-mv-hide-nav [class*="Navigation"],
    html.chzzk-mv-hide-nav [class*="navigation"] {
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;
    (document.head || document.documentElement).appendChild(style);
  })();
})();
