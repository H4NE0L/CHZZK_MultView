"use strict";
(() => {
  // src/content/power-rewards.js
  function create({ findVideo }) {
    let enabled = false, disposed = false, timer = null, attempts = 0;
    const pressed = /* @__PURE__ */ new WeakMap(), styled = /* @__PURE__ */ new Set();
    const style = document.createElement("style");
    style.textContent = ".cz-power-native-player{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;z-index:2147483000!important}";
    function scan() {
      if (!enabled || disposed) return;
      for (const player of styled) if (!player.isConnected) {
        player.classList.remove("cz-power-native-player");
        styled.delete(player);
      }
      const video = findVideo();
      if (video) {
        const player = video.closest(".pzp-pc,[data-player]");
        if (player) {
          player.classList.add("cz-power-native-player");
          styled.add(player);
        }
      }
      const normal = [...document.querySelectorAll(".pzp-pc__viewmode-button")].find((button) => /기본 화면|일반 화면|원래 화면|normal view/i.test(`${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""}`));
      if (normal && !pressed.has(normal)) {
        pressed.set(normal, "normal");
        normal.click();
      }
      if (video && !video.paused && !video.ended && video.readyState >= 2) {
        for (const button of [...document.querySelectorAll('button,[role="button"]')].slice(-600)) {
          if (button.closest('[data-chat-message],[class*="chatting_message"],[class*="live_chatting_list_item"]')) continue;
          const label = [button.getAttribute("aria-label"), button.getAttribute("title"), button.textContent].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
          const ready = !button.disabled && button.getAttribute("aria-disabled") !== "true" && !button.closest('[hidden],[aria-hidden="true"]') && /통나무|log.?power/i.test(label + " " + (button.closest('[class*="log_power"],[class*="logPower"],[data-log-power]')?.className || "")) && /받기|수령|획득|claim/i.test(label) && !/승부|예측|베팅|구매|사용|후원|참여|prediction|bet|buy/i.test(label);
          if (!ready) {
            if (pressed.get(button) !== "normal") pressed.delete(button);
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
      if (disposed) return;
      enabled = on === true;
      clearTimeout(timer);
      timer = null;
      if (enabled) {
        if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
        scan();
      } else {
        for (const button of document.querySelectorAll(".pzp-pc__viewmode-button")) if (pressed.get(button) === "normal") pressed.delete(button);
        for (const player of styled) player.classList.remove("cz-power-native-player");
        styled.clear();
        style.remove();
        document.documentElement.removeAttribute("data-cz-power-rewards");
      }
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
      if (!chatMode) audio.bind(video);
      if (!chatMode) window.parent.postMessage({ source: "chzzk-multiview", type: "PLAYER_READY", uid: frameUid }, PARENT_ORIGIN);
    }
    function bindObserver() {
      if (videoObserver || !document.documentElement) return;
      videoObserver = new MutationObserver(() => {
        document.querySelectorAll("video").forEach(bindVideo);
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
    setInterval(reportSyncState, 1e3);
    const powerRewards = chatMode ? null : create({ findVideo });
    let theaterApplied = false;
    let theaterTimer = null;
    function getTheaterButton() {
      const buttons = Array.from(document.querySelectorAll(
        '.pzp-pc__viewmode-button, button, [role="button"]'
      ));
      return buttons.find((el) => {
        const text = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.textContent || ""}`.trim();
        return /넓은 화면|극장|theater|cinema/i.test(text);
      }) || null;
    }
    function isWideModeButton(button) {
      if (!button) return false;
      const text = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""} ${button.textContent || ""}`.trim();
      if (/기본 화면|일반 화면|원래 화면|나가기|exit/i.test(text)) return false;
      return /넓은 화면|극장|theater|cinema/i.test(text);
    }
    function pressTheaterShortcut() {
      if (chatMode || theaterApplied) return false;
      const video = findVideo();
      if (!video) return false;
      const button = getTheaterButton();
      if (!button) return false;
      if (!isWideModeButton(button)) {
        theaterApplied = true;
        return false;
      }
      try {
        button.click();
        theaterApplied = true;
        return true;
      } catch (_) {
        return false;
      }
    }
    function scheduleTheater() {
      if (chatMode || powerRewards?.enabled || theaterApplied || theaterTimer) return;
      let tries = 0;
      theaterTimer = setInterval(() => {
        tries++;
        if (pressTheaterShortcut()) {
          clearInterval(theaterTimer);
          theaterTimer = null;
          hideChat();
          return;
        }
        const video = findVideo();
        if (video?.readyState >= 2) {
          const button = getTheaterButton();
          if (button && !isWideModeButton(button)) {
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
    bindObserver();
    if (chatMode) window.parent.postMessage({ source: "chzzk-multiview", type: "CHAT_READY", uid: frameUid }, PARENT_ORIGIN);
    window.addEventListener("message", (event) => {
      if (!CZMessages.isParentCommand(event, PARENT_ORIGIN, window.parent)) return;
      if (event.data.type === "POWER_REWARDS_CONFIG" && powerRewards) {
        clearInterval(theaterTimer);
        theaterTimer = null;
        powerRewards.configure(event.data.enabled);
        if (!powerRewards.enabled) {
          theaterApplied = false;
          scheduleTheater();
        }
      }
      if (event.data.type === "POWER_DIAGNOSTICS" && !chatMode) chrome.runtime.sendMessage({ type: "POWER_DIAGNOSTICS" }).then((result) => window.parent.postMessage({ source: "chzzk-multiview", type: "POWER_DIAGNOSTICS_RESULT", uid: frameUid, requestId: event.data.requestId, ...result?.ok ? { diagnostics: result.diagnostics } : { error: result?.error || "점검 실행 실패" } }, PARENT_ORIGIN)).catch((error) => window.parent.postMessage({ source: "chzzk-multiview", type: "POWER_DIAGNOSTICS_RESULT", uid: frameUid, requestId: event.data.requestId, error: String(error) }, PARENT_ORIGIN));
      if (event.data.type === "CHAT_TIMESTAMP_CONFIG" && chatMode) configureTimestamps(event.data.enabled);
      if (event.data.type === "CHAT_PRESENTATION" && chatMode) CZChatLayout.setPresentation(event.data);
      if (event.data.type === "IMPORTANT_CHAT_CONFIG" && chatMode) importantCollector?.configure(event.data.settings, { streamerName: event.data.streamerName });
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
      if (event.data.type === "ENTER_THEATER" && !chatMode && !powerRewards?.enabled) {
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
