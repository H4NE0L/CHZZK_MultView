globalThis.CZChatLayout = (() => {
  function findReplayChatRoot(doc) {
    const markers = Array.from(doc.querySelectorAll("body *")).filter(el => {
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

        // Avoid selecting the entire page shell when walking up the tree.
        if (rect.width > doc.documentElement.clientWidth * 0.95 && rect.height > doc.documentElement.clientHeight * 0.9) score -= 12;

        const area = rect.width * rect.height;
        if (!best || score > best.score || (score === best.score && area < best.area)) {
          best = { el: node, score, area };
        }
      }
    }

    return best?.el || null;
  }

  function findChatRoot(doc) {
    const selectors = [
      '[class*="live_chat"]', '[class*="LiveChat"]',
      '[class*="liveChat"]', '[class*="chat_area"]', '[class*="chatArea"]',
      '[class*="chat-container"]', '[class*="chatContainer"]',
      '[class*="chatting"]', '[class*="Chatting"]',
      '[class*="_chat_"]', '[class*="chat__"]',
      '[data-testid*="chat"]', '[data-test*="chat"]',
      '[id*="chat"]', '[id*="Chat"]',
      'aside'
    ];

    const candidates = [];

    for (const selector of selectors) {
      for (const el of doc.querySelectorAll(selector)) {
        if (!isVisible(el)) continue;
        // Input boxes can become taller while idle, but are not chat roots.
        if (el.matches('input,textarea,[contenteditable]') || /(?:input|textbox|composer)/i.test(String(el.className || ''))) continue;

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
    // Keep every ancestor of the chat root visible, but make the chat itself
    // fill the iframe. This avoids the clipped-right-column problem caused by
    // nested CHZZK layout containers.
    const ancestors = new Set();
    let node = chatRoot;
    while (node && node !== doc.body) {
      ancestors.add(node);
      node = node.parentElement;
    }

    for (const el of Array.from(doc.body.querySelectorAll("*"))) {
      if (el === chatRoot || chatRoot.contains(el) || ancestors.has(el)) continue;
      el.style.setProperty("display", "none", "important");
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

    // Prevent the CHZZK chat layout from creating a document-level scrollbar.
    // The chat itself owns the available iframe area; internal message scrolling
    // remains available inside the chat component.
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
    chatRoot.style.setProperty("z-index", "2147483647", "important");

    // The chat iframe must never be a second audio source. Pause/mute now and
    // repeatedly because the CHZZK player may recreate its <video> element.
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
    setTimeout(() => observer.disconnect(), 15000);
  }


  function stabilizeInput(doc, root) {
    if (!doc.getElementById('cz-chat-input-size')) {
      const style=doc.createElement('style');style.id='cz-chat-input-size';
      style.textContent='.cz-chat-input-idle{box-sizing:border-box!important;height:46px!important;min-height:46px!important;max-height:46px!important;padding-top:8px!important;padding-bottom:8px!important;align-items:center!important}.cz-chat-input-idle textarea,.cz-chat-input-idle [contenteditable]{box-sizing:border-box!important;min-height:0!important;max-height:28px!important;line-height:24px!important;margin-top:0!important;margin-bottom:0!important}';
      (doc.head || doc.documentElement).appendChild(style);
    }
    root.querySelectorAll('textarea,[contenteditable],input[type="text"],input:not([type])').forEach(input=>{
      const box=input.closest('[class*="chat_input_box"],[class*="chatting_input_box"],[class*="chatInputBox"],[class*="ChatInputBox"],[class*="chat_input_field"],[class*="chatting_input_field"]');
      if (!box || box===root || !root.contains(box)) return;
      const empty=!String(input.value ?? input.textContent ?? '').trim();
      box.classList.toggle('cz-chat-input-idle',empty && !box.contains(doc.activeElement));
    });
  }
  let preparedRoot = null;
  function prepare() {
    const replay = location.pathname.startsWith('/video/');
    const root = preparedRoot?.isConnected ? preparedRoot : replay ? (findReplayChatRoot(document) || findChatRoot(document)) : findChatRoot(document);
    if (!root) return false;
    if (root !== preparedRoot) {
      prepareChatOnlyFrame(document, root);
      preparedRoot = root;
    }
    stabilizeInput(document,root);
    return true;
  }
  function start() {
    const apply = () => {
      document.querySelectorAll('video').forEach(v => { v.muted = true; v.volume = 0; try { v.pause(); } catch (_) {} });
      prepare();
    };
    apply();
    document.addEventListener('focusin',apply);document.addEventListener('focusout',()=>queueMicrotask(apply));document.addEventListener('input',apply);
    // DOM hydration can replace the replay/chat root after its first appearance.
    setInterval(apply, 1000);
  }
  return {start};
})();
