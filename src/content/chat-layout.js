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
  let presentation={name:'',height:0},onSettings=()=>{},onHeader=()=>{},nativeMenuOpen=false;
  const boundRoots=new WeakSet();
  function setPresentation(value){presentation={name:String(value.name||'').slice(0,160),height:Math.max(0,Math.min(1600,Number(value.height)||0))};prepare();}
  function findHeader(scope){
    const named=scope.querySelector('.cz-native-chat-header,[class*="live_chatting_header"],[class*="video_chatting_header"],[data-chat-toolbar]');
    if(named)return named;
    // CHZZK variants use different CSS module prefixes. Restrict fallback to
    // the short toolbar containing the exact title and font-size controls.
    for(const el of scope.querySelectorAll('h1,h2,h3,strong,span,div')){
      if(el.children.length || el.textContent.trim()!=='채팅')continue;
      let parent=el.parentElement;
      for(let depth=0;parent && depth<3;depth++,parent=parent.parentElement){
        if(parent.textContent.length<160 && /\d+\s*%/.test(parent.textContent) && parent.querySelectorAll('button').length>=2)return parent;
      }
    }
    return null;
  }
  function mountHeaderIcon(host,content){
    // Keep CHZZK's SVG/path rules outside extension-owned icons.
    const icon=document.createElement('span');icon.setAttribute('aria-hidden','true');host.appendChild(icon);
    const shadow=icon.attachShadow({mode:'open'});
    shadow.innerHTML='<style>:host{display:block!important;width:16px!important;height:16px!important;flex:none!important;line-height:0!important}svg{display:block;width:16px;height:16px;min-width:16px;max-width:16px;overflow:visible;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;transform:none;filter:none;opacity:1}</style><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+content+'</svg>';
  }
  function nativeHeader(root){
    const header=findHeader(root);
    if(!header)return;
    header.classList.add('cz-native-chat-header');
    if(!boundRoots.has(root)){
      boundRoots.add(root);
      root.addEventListener('click',event=>{const control=event.target.closest?.('button,[role=button]');if(control?.id==='cz-chat-settings' || event.target.closest?.('#cz-chat-channel'))return;const current=root.querySelector('.cz-native-chat-header');nativeMenuOpen=!!(control && current?.contains(control) && !nativeMenuOpen);if(current)onHeader(Math.round(current.getBoundingClientRect().height),nativeMenuOpen);});
      root.addEventListener('keydown',event=>{if(event.key==='Escape'){nativeMenuOpen=false;const current=root.querySelector('.cz-native-chat-header');if(current)onHeader(Math.round(current.getBoundingClientRect().height),false);}});
    }
    if(nativeMenuOpen){onHeader(Math.round(header.getBoundingClientRect().height),true);return;}
    let title=header.querySelector('.cz-channel-name,[class*="header_title"],[class*="header_name"],h1,h2,h3');
    if(!title){title=document.createElement('strong');title.className='cz-channel-name';header.prepend(title);}
    title.classList.add('cz-channel-name');if(title.textContent!==presentation.name)title.textContent=presentation.name;
    header.querySelectorAll('[class*="font_size"],[class*="fontSize"],[class*="font-size"],[class*="header_font"],[class*="zoom"],[aria-label*="글씨"],[aria-label*="글자"],[title*="글씨"],[title*="글자"]').forEach(el=>el.style.setProperty('display','none','important'));
    for(const el of header.querySelectorAll('*')){
      if(el===title || el.contains(title) || el.closest('#cz-chat-settings'))continue;
      const text=el.textContent.trim();
      if(!el.children.length && text==='채팅')el.style.setProperty('display','none','important');
      if((/^\d+\s*%$/.test(text) || /^[+−–-]$/.test(text)) && !el.querySelector('button')){
        const control=el.closest('button')||el;control.style.setProperty('display','none','important');
      }
    }
    for(const node of [...header.childNodes])if(node.nodeType===3 && /채팅/.test(node.textContent))node.textContent='';
    const native=header.querySelector('.cz-native-settings')||[...header.querySelectorAll('button')].filter(el=>el.id!=='cz-chat-settings').at(-1);
    // Font controls may be SVG-only buttons without labels or readable text.
    // Preserve the original menu button and remove every other native header control.
    for(const control of header.querySelectorAll('button'))if(control!==native && control.id!=='cz-chat-settings')control.style.setProperty('display','none','important');
    for(const leaf of [title,native]){
      let wrapper=leaf?.parentElement;
      while(wrapper && wrapper!==header){wrapper.style.setProperty('display','contents','important');wrapper=wrapper.parentElement;}
    }
    let button=header.querySelector('#cz-chat-settings');
    if(!button){button=document.createElement('button');button.id='cz-chat-settings';button.type='button';button.title='주요 채팅 설정';button.setAttribute('aria-label','주요 채팅 설정');mountHeaderIcon(button,'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m9.5 3-.5 3-2 1-3-.5-2 3.5 2.5 2v2L2 16l2 3.5 3-.5 2 1 .5 3h5l.5-3 2-1 3 .5 2-3.5-2.5-2v-2l2.5-2L20 6.5l-3 .5-2-1-.5-3Z"/>');button.onclick=()=>onSettings();if(native)native.before(button);else header.appendChild(button);}
    let channel=header.querySelector('#cz-chat-channel');
    if(!channel){channel=document.createElement('a');channel.id='cz-chat-channel';channel.target='_blank';channel.rel='noopener noreferrer';channel.title='현재 채널 열기';channel.setAttribute('aria-label','현재 채널 열기');mountHeaderIcon(channel,'<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>');button.before(channel);}
    channel.href=location.origin+location.pathname.replace(/\/chat\/?$/,'');
    if(native)native.classList.add('cz-native-settings');
    let spacer=root.querySelector('#cz-important-chat-space');
    if(!spacer){spacer=document.createElement('div');spacer.id='cz-important-chat-space';header.after(spacer);}
    spacer.style.cssText='flex:0 0 '+presentation.height+'px;height:'+presentation.height+'px;pointer-events:none';
    const height=Math.round(header.getBoundingClientRect().height);if(height>=24)onHeader(height,nativeMenuOpen);
  }
  let preparedRoot = null,preparedRootStyle='';
  function prepare() {
    const replay = location.pathname.startsWith('/video/');
    let root = preparedRoot?.isConnected ? preparedRoot : replay ? (findReplayChatRoot(document) || findChatRoot(document)) : findChatRoot(document);
    if (!root) return false;
    const header=findHeader(document);
    if(header && !root.contains(header)){
      let common=root.parentElement;
      while(common && !common.contains(header))common=common.parentElement;
      // Include a sibling native toolbar without capturing the full video page.
      if(common && (location.pathname.endsWith('/chat') || common.getBoundingClientRect().width<=root.getBoundingClientRect().width+40))root=common;
    }
    if (root !== preparedRoot) {
      if(preparedRoot?.isConnected)preparedRoot.style.cssText=preparedRootStyle;
      preparedRootStyle=root.style.cssText;
      prepareChatOnlyFrame(document, root);
      preparedRoot = root;
    }
    root.classList.add('cz-chat-only');
    if(!document.getElementById('cz-chat-chrome')){
      const style=document.createElement('style');style.id='cz-chat-chrome';
      style.textContent='.cz-chat-only{border:0!important;border-radius:0!important}.cz-native-chat-header{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:4px!important;padding:0 8px!important;flex-shrink:0;min-height:36px;box-sizing:border-box}.cz-channel-name{position:static!important;transform:none!important;flex:1 1 0!important;width:auto!important;max-width:none!important;font-size:14px!important;font-weight:700!important;line-height:20px!important;color:#f5f7fa!important;text-align:left!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;margin:0 auto 0 0!important;padding:0!important;order:-1!important}#cz-chat-settings,#cz-chat-channel,.cz-native-settings{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 28px!important;width:28px!important;height:28px!important;min-width:28px!important;margin:0!important;padding:0!important;border:0!important;border-radius:4px!important;background:transparent!important;color:#c6ccd5!important;cursor:pointer;box-sizing:border-box!important}#cz-chat-settings svg,#cz-chat-channel svg{display:block!important;width:16px!important;height:16px!important;flex:none!important}#cz-chat-settings:hover,#cz-chat-channel:hover{color:#fff!important;background:#ffffff12!important}';
      (document.head||document.documentElement).appendChild(style);
    }
    nativeHeader(root);
    stabilizeInput(document,root);
    return true;
  }
  function start(options={}) {
    onSettings=options.onSettings||onSettings;onHeader=options.onHeader||onHeader;
    const apply = () => {
      document.querySelectorAll('video').forEach(v => { v.muted = true; v.volume = 0; try { v.pause(); } catch (_) {} });
      prepare();
    };
    apply();
    document.addEventListener('focusin',apply);document.addEventListener('focusout',()=>queueMicrotask(apply));document.addEventListener('input',apply);
    // DOM hydration can replace the replay/chat root after its first appearance.
    setInterval(apply, 1000);
  }
  return {start,setPresentation};
})();
