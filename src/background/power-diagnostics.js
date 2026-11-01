"use strict";
(() => {
  // src/background/power-diagnostics.js
  (() => {
    function snapshot(sampleOnly = false) {
      const identity = globalThis.__CZMediaDiagnosticIdentity ||= { nodes: /* @__PURE__ */ new WeakMap(), sequence: 0 };
      const readMedia = (element) => {
        if (!identity.nodes.has(element)) identity.nodes.set(element, ++identity.sequence);
        const quality = element.getVideoPlaybackQuality?.();
        return { elementId: identity.nodes.get(element), tag: element.tagName?.toLowerCase() || "video", paused: element.paused, ended: element.ended, readyState: element.readyState, muted: element.muted, volume: Number.isFinite(element.volume) ? element.volume : null, currentTime: Number.isFinite(element.currentTime) ? element.currentTime : null, playbackRate: element.playbackRate ?? null, totalVideoFrames: quality?.totalVideoFrames ?? null, droppedVideoFrames: quality?.droppedVideoFrames ?? null, audioDecodedBytes: element.webkitAudioDecodedByteCount ?? null, errorCode: element.error?.code || null, audioTracks: element.audioTracks ? Array.from(element.audioTracks).slice(0, 8).map((track) => ({ enabled: track.enabled, kind: track.kind })) : null };
      };
      const mediaElements = [...document.querySelectorAll("video,audio")].filter((element) => ["VIDEO", "AUDIO"].includes(element.tagName)).slice(0, 8).map(readMedia);
      const runtime = globalThis.__CZAudioRuntime?.snapshot?.() || { available: false, contexts: [] };
      const clock = performance.now?.() ?? null;
      if (sampleOnly) return { clock, mediaElements, audioRuntime: runtime };
      const video = document.querySelector("video"), chat = document.querySelector('[class*="live_chat"],[class*="chat_area"],[class*="liveChat"],[class*="chatting"],[data-chat-toolbar]');
      const candidates = [...document.querySelectorAll("button,[role=button]")].slice(-600).filter((button) => !button.closest('[class^="_chatting_message_"],[class*=" _chatting_message_"],[class*="live_chatting_list_item"],[data-chat-message]')).map((button) => ({ label: [button.getAttribute("aria-label"), button.getAttribute("title"), button.textContent, ...[...button.querySelectorAll("img[alt],svg title")].map((icon) => icon.getAttribute("alt") || icon.textContent)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 120), classes: String(button.className || "").slice(0, 160), disabled: button.disabled === true || button.getAttribute("aria-disabled") === "true" })).filter((button) => /통나무|보너스|log.?power|watch.?reward/i.test(button.label)).slice(0, 12);
      const routes = /* @__PURE__ */ new Map();
      for (const entry of performance.getEntriesByType("resource").slice(-300)) {
        if (!["fetch", "xmlhttprequest", "beacon"].includes(entry.initiatorType)) continue;
        try {
          const url = new URL(entry.name);
          if (url.protocol !== "https:" || !/(^|\.)(naver\.com|pstatic\.net)$/.test(url.hostname)) continue;
          const path = url.pathname.split("/").map((segment) => segment.length > 36 || /^[a-f\d]{16,}$/i.test(segment) ? ":id" : /^\d{6,}$/.test(segment) ? ":number" : segment).join("/");
          const key = url.origin + path, previous = routes.get(key);
          routes.set(key, { path: key, initiator: entry.initiatorType, count: (previous?.count || 0) + 1, status: entry.responseStatus || null });
        } catch (_) {
        }
      }
      return { revision: "20261101-1", clock, mediaElements, audioRuntime: runtime, mediaSession: navigator.mediaSession?.playbackState ?? null, rewardHelper: document.documentElement?.getAttribute?.("data-cz-power-rewards") || null, capturedAt: (/* @__PURE__ */ new Date()).toISOString(), visibility: document.visibilityState, focused: document.hasFocus(), video: video ? readMedia(video) : null, chatMounted: !!chat, chatDisplay: chat ? getComputedStyle(chat).display : null, buttons: candidates, routes: [...routes.values()].slice(-70), note: "Read-only resource paths; no headers, cookies, query values or response bodies. Status may be unavailable. Resource history may be incomplete." };
    }
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      const teardown = message?.type === "PLAYER_AUDIO_TEARDOWN";
      if (!teardown && message?.type !== "POWER_DIAGNOSTICS") return;
      let url;
      try {
        url = new URL(sender.url);
      } catch (_) {
        return;
      }
      if (sender.id !== chrome.runtime.id || url.origin !== "https://chzzk.naver.com" || !(teardown ? /^\/(?:live|video)\/[\w-]+\/?$/ : /^\/live\/[\w-]+\/?$/).test(url.pathname) || !Number.isInteger(sender.tab?.id) || !Number.isInteger(sender.frameId) || sender.frameId <= 0) return;
      if (teardown) {
        chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, world: "MAIN", func: async () => globalThis.__CZAudioRuntime?.close ? await globalThis.__CZAudioRuntime.close() : { observed: null, available: false } }).then((results) => reply({ ok: true, audio: results[0]?.result })).catch((error) => reply({ ok: false, error: String(error) }));
        return true;
      }
      chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, world: "MAIN", func: snapshot }).then(async (results) => {
        const diagnostics = results[0]?.result;
        await new Promise((resolve) => setTimeout(resolve, 500));
        const second = await chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, world: "MAIN", func: snapshot, args: [true] });
        const after = second[0]?.result;
        const beforeMedia = diagnostics?.video, afterMedia = after?.mediaElements?.find((element) => element.elementId === beforeMedia?.elementId);
        const sameElement = beforeMedia?.elementId != null && beforeMedia.elementId === afterMedia?.elementId;
        const delta = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
        const mediaDelta = (a, b) => sameElement ? delta(a, b) : null;
        diagnostics.playbackProbe = { sameElement, requestedIntervalMs: 500, elapsedMs: delta(diagnostics.clock, after?.clock), currentTimeDelta: mediaDelta(beforeMedia?.currentTime, afterMedia?.currentTime), decodedVideoFramesDelta: mediaDelta(beforeMedia?.totalVideoFrames, afterMedia?.totalVideoFrames), decodedAudioBytesDelta: mediaDelta(beforeMedia?.audioDecodedBytes, afterMedia?.audioDecodedBytes), after };
        reply({ ok: true, diagnostics });
      }).catch((error) => reply({ ok: false, error: String(error) }));
      return true;
    });
  })();
})();
