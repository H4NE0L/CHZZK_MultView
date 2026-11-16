"use strict";
(() => {
  // src/shared/media/filename.ts
  var DEFAULT_SCREENSHOT_NAME = "{channel}_{title}_{YYYY}{MM}{DD}{HH}{mm}{ss}";
  var DEFAULT_RECORDING_NAME = "[{YY}.{MM}.{DD}]{channel}_{title}";
  var NAME_TOKENS = ["channel", "title", "uid", "date", "time", "YYYY", "YY", "MM", "DD", "HH", "mm", "ss"];
  function templateError(value) {
    if (typeof value !== "string" || !value.trim()) return "파일명 형식을 입력하세요.";
    if (value.length > 200) return "파일명 형식은 200자 이하로 입력하세요.";
    if (/[{}]/.test(value.replace(/\{([^{}]+)\}/g, (token, key) => NAME_TOKENS.includes(key) ? "" : token))) return "지원하는 치환 항목만 사용하세요.";
    if (/\.(png|mp4|webm)\s*$/i.test(value)) return "확장자는 자동으로 붙습니다. 형식에서 확장자를 빼주세요.";
    return "";
  }
  function normalizeTemplate(value, kind) {
    return templateError(value) ? kind === "recording" ? DEFAULT_RECORDING_NAME : DEFAULT_SCREENSHOT_NAME : value.trim();
  }

  // src/shared/session-store.ts
  var record = (value) => value && typeof value === "object" ? value : {};
  var sessionStore = (() => {
    const KEY = "chzzkMultiviewV09";
    const DEFAULT_STATE = Object.freeze({ channels: [], selectedUid: null, layout: "grid", chatOpen: true, screenLocked: false, mainOnly: false, masterVolume: 1, chatSide: "right", shortcutsEnabled: true, powerRewards: false, chatTimestamps: false, rewindBar: true, autoWide: true, screenshotNameFormat: DEFAULT_SCREENSHOT_NAME, recordingNameFormat: DEFAULT_RECORDING_NAME });
    const clamp01 = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0;
    function parseInput(value) {
      const raw = String(value || "").trim();
      if (!raw) return null;
      if (/^[A-Za-z0-9_-]{6,}$/.test(raw)) {
        return { type: "live", id: raw, uid: raw, url: `https://chzzk.naver.com/live/${encodeURIComponent(raw)}` };
      }
      const shorthandVideo = raw.match(/^\/?video\/([^/?#]+)$/i);
      if (shorthandVideo) {
        const id = shorthandVideo[1];
        return { type: "video", id, uid: `video:${id}`, url: `https://chzzk.naver.com/video/${encodeURIComponent(id)}` };
      }
      try {
        const url = new URL(raw);
        if (url.protocol !== "https:" || url.hostname !== "chzzk.naver.com") return null;
        const live = url.pathname.match(/^\/live\/([^/?#]+)/);
        if (live) {
          return { type: "live", id: live[1], uid: live[1], url: `https://chzzk.naver.com/live/${encodeURIComponent(live[1])}` };
        }
        const video = url.pathname.match(/^\/video\/([^/?#]+)/);
        if (video) {
          return { type: "video", id: video[1], uid: `video:${video[1]}`, url: `https://chzzk.naver.com/video/${encodeURIComponent(video[1])}` };
        }
      } catch (_) {
      }
      return null;
    }
    function normalize(value = {}) {
      const saved = record(value);
      const channels = [];
      for (const raw of Array.isArray(saved.channels) ? saved.channels : []) {
        const input = record(raw);
        const parsed = parseInput(input?.url || (typeof input.uid === "string" && input.uid.startsWith("video:") ? `video/${input.uid.slice(6)}` : input?.uid));
        if (!parsed || channels.some((c) => c.uid === parsed.uid)) continue;
        const { _mainOnlyMuted, streamInfo, ...rest } = input;
        channels.push({
          ...rest,
          uid: parsed.uid,
          type: parsed.type,
          sourceId: parsed.id,
          url: parsed.url,
          volume: input.volume == null ? 1 : clamp01(input.volume),
          muted: input.muted !== false
        });
      }
      const layout = saved.layout === "main-sub" ? "main-sub" : "grid";
      const visible = channels.slice(0, layout === "main-sub" ? 4 : 9);
      return {
        screenshotNameFormat: normalizeTemplate(saved.screenshotNameFormat, "screenshot"),
        recordingNameFormat: normalizeTemplate(saved.recordingNameFormat, "recording"),
        channels,
        selectedUid: typeof saved.selectedUid === "string" && visible.some((c) => c.uid === saved.selectedUid) ? saved.selectedUid : visible[0]?.uid || null,
        layout,
        chatOpen: saved.chatOpen !== false,
        screenLocked: saved.screenLocked === true,
        mainOnly: saved.mainOnly === true,
        masterVolume: saved.masterVolume == null ? 1 : clamp01(saved.masterVolume),
        chatSide: saved.chatSide === "left" ? "left" : "right",
        shortcutsEnabled: saved.shortcutsEnabled !== false,
        powerRewards: saved.powerRewards === true,
        chatTimestamps: saved.chatTimestamps === true,
        rewindBar: saved.rewindBar !== false,
        autoWide: saved.autoWide !== false
      };
    }
    async function read() {
      return normalize((await chrome.storage.local.get(KEY))[KEY]);
    }
    async function write(state) {
      await chrome.storage.local.set({ [KEY]: normalize(state) });
    }
    return Object.freeze({ KEY, DEFAULT_STATE, parseInput, normalize, read, write });
  })();
  globalThis.CZSessionStore = sessionStore;
})();
