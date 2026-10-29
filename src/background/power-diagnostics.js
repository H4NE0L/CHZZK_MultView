"use strict";
(() => {
  // src/background/power-diagnostics.js
  (() => {
    function snapshot() {
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
      return { revision: "20261030-1", rewardHelper: document.documentElement?.getAttribute?.("data-cz-power-rewards") || null, capturedAt: (/* @__PURE__ */ new Date()).toISOString(), visibility: document.visibilityState, focused: document.hasFocus(), video: video ? { paused: video.paused, ended: video.ended, readyState: video.readyState, muted: video.muted } : null, chatMounted: !!chat, chatDisplay: chat ? getComputedStyle(chat).display : null, buttons: candidates, routes: [...routes.values()].slice(-70), note: "Read-only resource paths; no headers, cookies, query values or response bodies. Status may be unavailable. Resource history may be incomplete." };
    }
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      if (message?.type !== "POWER_DIAGNOSTICS") return;
      let url;
      try {
        url = new URL(sender.url);
      } catch (_) {
        return;
      }
      if (sender.id !== chrome.runtime.id || url.origin !== "https://chzzk.naver.com" || !/^\/live\/[\w-]+\/?$/.test(url.pathname) || !Number.isInteger(sender.tab?.id) || !Number.isInteger(sender.frameId) || sender.frameId <= 0) return;
      chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, world: "MAIN", func: snapshot }).then((results) => reply({ ok: true, diagnostics: results[0]?.result })).catch((error) => reply({ ok: false, error: String(error) }));
      return true;
    });
  })();
})();
