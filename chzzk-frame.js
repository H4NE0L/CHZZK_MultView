/* CHZZK live iframe helper for MultiView. */
(() => {
  if (window.top === window) return;

  let videoObserver = null;
  let uiObserver = null;
  let chatMode = new URLSearchParams(location.search).get("multiview") === "chat" || new URLSearchParams(location.search).get("multiview") === "1" && location.pathname.endsWith("/chat");
  const frameUid = (() => {
    const m = location.pathname.match(/^\/live\/([^/?#]+)/);
    return m ? m[1] : null;
  })();

  function getChannelName() {
    const candidates = [
      '[class*="channel_name"]', '[class*="channelName"]',
      '[class*="profile_name"]', '[class*="profileName"]',
      '[class*="nickname"]', '[class*="NickName"]',
      '[data-testid*="channel-name"]', '[data-testid*="channelName"]'
    ];
    for (const selector of candidates) {
      const el = document.querySelector(selector);
      const text = el?.textContent?.trim();
      if (text && text.length < 80) return text;
    }
    const meta = document.querySelector('meta[property="og:title"], meta[name="twitter:title"]');
    const title = (document.title || meta?.content || "").trim();
    if (title) {
      const cleaned = title.replace(/\s*[-|]\s*(치지직|CHZZK).*$/i, "").trim();
      const parts = cleaned.split(/\s+-\s+/).map(v => v.trim()).filter(Boolean);
      if (parts.length >= 2) return parts[0];
      if (cleaned) return cleaned;
    }
    return null;
  }

  function sendChannelInfo() {
    if (!frameUid) return;
    const channelName = getChannelName();
    const title = document.title || "";
    if (channelName || title) {
      window.parent.postMessage({
        source: "chzzk-multiview", type: "CHANNEL_INFO", uid: frameUid,
        channelName: channelName || undefined, title
      }, "*");
    }
  }

  function findVideo() {
    return document.querySelector("video");
  }

  function isVideoMuted(video) {
    if (!video) return true;
    // CHZZK can represent mute either through the media element's `muted` flag
    // or by setting the volume itself to zero. Treat both as the same UI state.
    return video.muted === true || Number(video.volume) <= 0;
  }

  function reportVideoState(video) {
    // The chat iframe silences its own <video>; it must never report that
    // state as if it were the broadcast player.
    if (!frameUid || !video || chatMode) return;
    window.parent.postMessage({
      source: "chzzk-multiview", type: "VIDEO_STATE", uid: frameUid,
      muted: isVideoMuted(video), volume: Number(video.volume)
    }, "*");
  }

  function setMuted(muted) {
    const video = findVideo();
    if (!video) return false;
    video.muted = !!muted;
    if (!muted) {
      try { video.volume = Math.max(Number(video.volume) || 0, 0.01); } catch (_) {}
    }
    reportVideoState(video);
    return true;
  }

  function setVolume(volume, muted = null) {
    const video = findVideo();
    if (!video) return false;
    const value = Math.max(0, Math.min(1, Number(volume) || 0));
    try { video.volume = value; } catch (_) {}
    if (typeof muted === "boolean") video.muted = muted;
    else if (value <= 0) video.muted = true;
    else video.muted = false;
    reportVideoState(video);
    return true;
  }

  function bindVideo(video) {
    if (!video || video.dataset.chzzkMvBound === "1") return;
    video.dataset.chzzkMvBound = "1";
    video.addEventListener("volumechange", () => reportVideoState(video));
    video.addEventListener("loadedmetadata", () => reportStreamInfo(video));
    video.addEventListener("playing", () => reportStreamInfo(video));
    reportVideoState(video);
    reportStreamInfo(video);
    startStats(video);
  }

  function bindObserver() {
    if (videoObserver || !document.documentElement) return;
    videoObserver = new MutationObserver(() => {
      // Re-bind whenever CHZZK replaces its player element.
      document.querySelectorAll("video").forEach(bindVideo);
    });
    videoObserver.observe(document.documentElement, { childList: true, subtree: true });
    document.querySelectorAll("video").forEach(bindVideo);
  }

  function matchesText(el, re) {
    const text = `${el.getAttribute?.("aria-label") || ""} ${el.getAttribute?.("title") || ""} ${el.textContent || ""}`;
    return re.test(text.trim());
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
      '[class*="live_chat"]', '[class*="LiveChat"]', '[class*="chat_area"]',
      '[class*="chatArea"]', '[class*="chat-container"]', '[class*="chatContainer"]',
      '[class*="chatting"]', '[class*="Chatting"]', '[id*="chat"]', '[id*="Chat"]'
    ];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (el === document.body || el === document.documentElement) continue;
        setHidden(el, true);
      }
    }
  }

  function showChat() {
    // MultiView currently keeps chat closed in video tiles. This exists for future use.
  }

  let statsTimer = null;
  let lastDecodedBytes = null;
  let lastStatsAt = 0;

  function getStreamStats(video) {
    if (!video) return {};
    const width = Number(video.videoWidth) || 0;
    const height = Number(video.videoHeight) || 0;
    let fps = 0;
    try {
      const quality = video.getVideoPlaybackQuality?.();
      const total = Number(quality?.totalVideoFrames) || 0;
      const now = performance.now();
      if (getStreamStats.lastFrames != null && getStreamStats.lastAt) {
        const dt = (now - getStreamStats.lastAt) / 1000;
        if (dt > 0.1) fps = Math.max(0, (total - getStreamStats.lastFrames) / dt);
      }
      getStreamStats.lastFrames = total;
      getStreamStats.lastAt = now;
    } catch (_) {}

    let bitrate = 0;
    const decodedBytes = Number(video.webkitVideoDecodedByteCount);
    const now = performance.now();
    if (Number.isFinite(decodedBytes) && decodedBytes >= 0 && lastDecodedBytes != null && lastStatsAt) {
      const dt = (now - lastStatsAt) / 1000;
      if (dt > 0.1 && decodedBytes >= lastDecodedBytes) bitrate = ((decodedBytes - lastDecodedBytes) * 8) / dt;
    }
    if (Number.isFinite(decodedBytes)) { lastDecodedBytes = decodedBytes; lastStatsAt = now; }

    let latency = NaN;
    try {
      if (video.buffered?.length) {
        const end = video.buffered.end(video.buffered.length - 1);
        const gap = end - video.currentTime;
        if (Number.isFinite(gap) && gap >= 0) latency = gap;
      }
    } catch (_) {}
    return { width, height, fps, bitrate, latency };
  }

  function reportStreamInfo(video) {
    if (!frameUid || !video || chatMode) return;
    const stats = getStreamStats(video);
    window.parent.postMessage({ source: "chzzk-multiview", type: "STREAM_INFO", uid: frameUid, ...stats }, "*");
  }

  function startStats(video) {
    if (statsTimer) clearInterval(statsTimer);
    reportStreamInfo(video);
    statsTimer = setInterval(() => {
      const current = findVideo();
      if (current) reportStreamInfo(current);
    }, 1000);
  }

  let theaterApplied = false;
  let theaterTimer = null;

  function getTheaterButton() {
    const buttons = Array.from(document.querySelectorAll(
      '.pzp-pc__viewmode-button, button, [role="button"]'
    ));

    return buttons.find(el => {
      const text = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.textContent || ""}`.trim();
      return /넓은 화면|극장|theater|cinema/i.test(text);
    }) || null;
  }

  function isWideModeButton(button) {
    if (!button) return false;
    const text = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""} ${button.textContent || ""}`.trim();
    // When the control says "넓은 화면", that is the action to ENTER
    // wide/theater mode. Controls labelled "기본 화면"/"일반 화면" are
    // the action to EXIT it and must never be clicked by this automation.
    if (/기본 화면|일반 화면|원래 화면|나가기|exit/i.test(text)) return false;
    return /넓은 화면|극장|theater|cinema/i.test(text);
  }

  function pressTheaterShortcut() {
    if (chatMode || theaterApplied) return false;
    const video = findVideo();
    if (!video) return false;

    const button = getTheaterButton();
    if (!button) return false;

    // Only click a button that explicitly represents entering wide mode.
    // Never use synthetic T/Alt+T fallback: an untrusted key can be handled
    // inconsistently and may toggle the player back and forth.
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
    if (chatMode || theaterApplied || theaterTimer) return;

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
        // The player can render its controls a little later than the video.
        // Keep polling briefly, but never click a control that means EXIT.
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

  bindObserver();
  preventFrameScrollbars();

  window.addEventListener("message", event => {
    if (event.data?.source !== "chzzk-multiview") return;
    if (event.data.type === "SET_NAV_VISIBLE") setNavVisible(!!event.data.visible);
    if (event.data.type === "SET_CHAT_MODE") chatMode = !!event.data.visible;
    if (event.data.type === "SET_CHAT_VISIBLE") event.data.visible ? showChat() : hideChat();
    if (event.data.type === "SET_MUTED") setMuted(!!event.data.muted);
    if (event.data.type === "SET_VOLUME") setVolume(event.data.volume, typeof event.data.muted === "boolean" ? event.data.muted : null);
    if (event.data.type === "ENTER_THEATER" && !chatMode) scheduleTheater();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === "SET_TILE_MUTED") {
      sendResponse({ ok: message.type === "SET_VOLUME" ? setVolume(message.volume, typeof message.muted === "boolean" ? message.muted : null) : setMuted(!!message.muted) });
    }
  });

  // Clicking inside a tile (including its header) never changes the main
  // broadcast. Only the tile's "메인으로 변경" button in the MultiView UI does.

  window.addEventListener("load", () => {
    sendChannelInfo();
    if (!chatMode) scheduleTheater();
  });
  setTimeout(sendChannelInfo, 800);
  setTimeout(sendChannelInfo, 2500);

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
