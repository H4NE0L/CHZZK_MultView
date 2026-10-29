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
    // The native pop-out chat already owns its viewport. Moving/hiding its
    // surrounding DOM breaks React portals used by user menus and predictions.
    if(location.pathname.endsWith('/chat')){
      // Remove the site's minimum popup width without changing positioning,
      // stacking, overflow or React portal hosts used by native actions.
      let container=chatRoot;
      while(container){
        container.classList.add('cz-chat-width');
        if(container===doc.documentElement)break;
        container=container.parentElement;
      }
      if(!doc.getElementById('cz-chat-viewport-width')){
        const style=doc.createElement('style');style.id='cz-chat-viewport-width';
        style.textContent='.cz-chat-width{min-width:0!important;max-width:100%!important;box-sizing:border-box!important}html.cz-chat-width,body.cz-chat-width,.cz-chat-only{width:100%!important}.cz-native-chat-header{min-width:0!important;max-width:100%!important}';
        (doc.head||doc.documentElement).appendChild(style);
      }
      chatRoot.style.setProperty('width','100%','important');
      doc.querySelectorAll('video').forEach(video=>video.style.setProperty('display','none','important'));
      return;
    }
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
      // Keep portal hosts and unknown UI intact; hide only known page chrome.
      if(el.matches('video,nav,[class*="video_player"],[class*="VideoPlayer"],[class*="global_header"]'))el.style.setProperty("display", "none", "important");
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
    chatRoot.style.setProperty("z-index", "1", "important");

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
  let presentation={name:'',height:0},onHeader=null,nativeMenuOpen=false;
  const boundRoots=new WeakSet();
  function setPresentation(value){presentation={name:String(value.name||'').slice(0,160),height:0};prepare();}
  const managedHeaders=new WeakSet();
  function isNativeHeader(header){
    if(managedHeaders.has(header))return true;
    // Third-party collectors clone CHZZK classes but replace the title.
    // A CSS class alone is not evidence that this is the native toolbar.
    const title=[...header.querySelectorAll('h1,h2,h3,strong,span,div')].some(el=>!el.children.length && ['채팅','라이브 채팅 다시보기','실시간 채팅 다시보기'].includes(el.textContent.trim()));
    const bare=[...header.childNodes].some(node=>node.nodeType===3 && node.textContent.trim()==='채팅');
    const replay=/^(라이브|실시간) 채팅 다시보기$/.test(header.textContent.trim()) || [...header.querySelectorAll('h1,h2,h3,strong,span')].some(el=>['라이브 채팅 다시보기','실시간 채팅 다시보기'].includes(el.textContent.trim()));
    return (title||bare) && (replay?header.querySelectorAll('button').length>=1:/\d+\s*%/.test(header.textContent) && header.querySelectorAll('button').length>=2);
  }
  function findHeader(scope){
    const candidates=[...scope.querySelectorAll('.cz-native-chat-header,[class*="live_chatting_header"],[class*="video_chatting_header"],[data-chat-toolbar]')].filter(isNativeHeader);
    const owned=candidates.find(node=>managedHeaders.has(node));if(owned)return owned;
    const innermost=candidates.find(node=>!candidates.some(other=>other!==node && node.contains(other)));if(innermost)return innermost;
    for(const el of scope.querySelectorAll('h1,h2,h3,strong,span,div')){
      if(el.children.length || el.textContent.trim()!=='채팅')continue;
      let parent=el.parentElement;
      for(let depth=0;parent && depth<3;depth++,parent=parent.parentElement)if(parent.textContent.length<160 && isNativeHeader(parent))return parent;
    }
    return null;
  }
  function cleanClonedControls(){
    for(const header of document.querySelectorAll('.cz-native-chat-header')){
      if(managedHeaders.has(header))continue;
      header.classList.remove('cz-native-chat-header');
      header.querySelectorAll('#cz-chat-settings,#cz-chat-channel').forEach(el=>el.remove());
      header.querySelectorAll('.cz-channel-name,.cz-native-settings').forEach(el=>el.classList.remove('cz-channel-name','cz-native-settings'));
    }
  }
  function mountHeaderIcon(host,content){
    // Keep CHZZK's SVG/path rules outside extension-owned icons.
    const icon=document.createElement('span');icon.setAttribute('aria-hidden','true');host.appendChild(icon);
    const shadow=icon.attachShadow({mode:'open'});
    shadow.innerHTML='<style>:host{display:block!important;width:20px!important;height:20px!important;flex:none!important;line-height:0!important}svg{display:block;width:20px;height:20px;min-width:20px;max-width:20px;overflow:visible;fill:currentColor;stroke:none;shape-rendering:geometricPrecision;transform:none;filter:none;opacity:1}</style><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'+content+'</svg>';
  }
  function overlayRects(){
    return [...document.querySelectorAll('[role="dialog"],[role="menu"],[aria-modal="true"],[class^="_layer_"],[class*=" _layer_"],[class*="layer_popup"],.cz-native-chat-header div,.cz-native-chat-header ul')].filter(el=>{
      if(el.matches('.cz-chat-only') || el.querySelector('.cz-chat-only'))return false;
      if(!isVisible(el) || !el.children.length && !el.textContent.trim())return false;
      const style=getComputedStyle(el),rect=el.getBoundingClientRect();if(el.closest('.cz-native-chat-header') && !el.matches('[role=dialog],[role=menu]') && (rect.width<80 || rect.height<40))return false;return el.matches('[role="dialog"],[role="menu"],[aria-modal="true"]') || ['fixed','absolute'].includes(style.position);
    }).slice(0,16).map(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};});
  }
  function overlayOpen(){return overlayRects().length>0;}
  function reportHeader(header){if(!onHeader)return;const rects=overlayRects();onHeader(Math.round(header.getBoundingClientRect().bottom),nativeMenuOpen||rects.length>0,rects);}
  function nativeHeader(root){
    const header=findHeader(root);
    if(!header)return;
    managedHeaders.add(header);
    header.classList.add('cz-native-chat-header');
    if(!boundRoots.has(root)){
      boundRoots.add(root);
      root.addEventListener('click',event=>{const control=event.target.closest?.('button,[role=button]');if(control?.id==='cz-chat-settings' || event.target.closest?.('#cz-chat-channel'))return;const current=root.querySelector('.cz-native-chat-header');nativeMenuOpen=!!(control && current?.contains(control) && !nativeMenuOpen);if(current)reportHeader(current);});
      root.addEventListener('keydown',event=>{if(event.key==='Escape'){nativeMenuOpen=false;const current=root.querySelector('.cz-native-chat-header');if(current)reportHeader(current);}});
    }
    if(nativeMenuOpen || overlayOpen()){reportHeader(header);return;}
    let title=header.querySelector('.cz-channel-name');
    if(!title){
      // Keep React-owned title nodes alive; replacing textContent can detach
      // nodes the native app still references when committing menu actions.
      const original=header.querySelector('[class*="header_title"],[class*="header_name"],h1,h2,h3');
      if(original && !original.querySelector('button,input,select'))original.style.setProperty('display','none','important');
      title=document.createElement('strong');title.className='cz-channel-name';header.prepend(title);
    }
    if(title.textContent!==presentation.name)title.textContent=presentation.name;
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
    // Only font controls are removed. User menus and prediction controls must
    // remain owned by CHZZK, including buttons added after hydration.
    for(const value of header.querySelectorAll('*')){
      if(value.children.length || !/^\d+\s*%$/.test(value.textContent.trim()))continue;
      for(const adjacent of [value.previousElementSibling,value.nextElementSibling])if(adjacent?.matches('button') && adjacent!==native)adjacent.style.setProperty('display','none','important');
    }
    header.querySelector('#cz-chat-settings')?.remove();
    let channel=header.querySelector('#cz-chat-channel');
    if(!channel){channel=document.createElement('a');channel.id='cz-chat-channel';channel.target='_blank';channel.rel='noopener noreferrer';channel.title='현재 채널 열기';channel.setAttribute('aria-label','현재 채널 열기');mountHeaderIcon(channel,'<path d="M10 1h5v5h-1.5V3.56L7.53 9.53 6.47 8.47l5.97-5.97H10V1ZM2.5 3H7v1.5H2.5v9h9V9H13v4.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 1 13.5v-9A1.5 1.5 0 0 1 2.5 3Z"/>');if(native)native.before(channel);else header.appendChild(channel);}
    channel.href=location.origin+location.pathname.replace(/\/chat\/?$/,'');
    if(native){
      native.classList.add('cz-native-settings');
      let wrapper=native.parentElement;
      while(wrapper && wrapper!==header){
        wrapper.classList.add('cz-native-action-wrapper');wrapper=wrapper.parentElement;
      }
    }
    root.querySelector('#cz-important-chat-space')?.remove();
    const height=Math.round(header.getBoundingClientRect().bottom);if(height>=24)reportHeader(header);
  }
  const timestampRows='[class*="live_chatting_list_item"],[data-chat-message],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
  let timestampRoot=null,timestampObserver=null;
  function stampMessages(root){
    if(timestampRoot===root)return;
    timestampObserver?.disconnect();timestampRoot=root;
    const stamp=row=>{
      const own=row.querySelector('.cz-native-chat-time');
      if(row.querySelector('time:not(.cz-native-chat-time)') || row.querySelector(timestampRows)){own?.remove();return;}
      const raw=row.getAttribute('data-message-time')||row.getAttribute('data-timestamp')||row.getAttribute('data-created-at'),number=raw?Number(raw):NaN;
      const parsed=raw?(Number.isFinite(number)?number*(number<1e12?1000:1):Date.parse(raw)):NaN;
      if(!Number.isFinite(parsed) || parsed<946684800000 || parsed>Date.now()+60000){own?.remove();return;}
      const date=new Date(parsed),iso=date.toISOString();
      if(own?.dateTime===iso)return;
      const time=own||document.createElement('time');time.className='cz-native-chat-time';time.dateTime=iso;time.textContent=date.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});time.title='원본 메시지 작성 시각';
      // Update only our node; never synthesize a send time from observation.
      if(!own)row.prepend(time);
    };
    const scan=node=>{if(node.nodeType!==1 || node.matches('.cz-native-chat-time'))return;if(node.matches(timestampRows))stamp(node);node.querySelectorAll(timestampRows).forEach(stamp);};
    root.querySelectorAll(timestampRows).forEach(stamp);
    timestampObserver=new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'){if(record.target.matches(timestampRows))stamp(record.target);continue;}for(const node of record.addedNodes)scan(node);}});
    timestampObserver.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-message-time','data-timestamp','data-created-at']});
  }
  let preparedRoot = null,preparedRootStyle='';
  function prepare() {
    cleanClonedControls();
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
      style.textContent+='.cz-native-chat-header{align-items:center!important}.cz-native-chat-header #cz-chat-channel,.cz-native-chat-header #cz-chat-settings,.cz-native-chat-header .cz-native-settings{position:static!important;inset:auto!important;transform:none!important;align-self:center!important;line-height:0!important;vertical-align:middle!important;float:none!important}.cz-native-settings svg{position:static!important;inset:auto!important;display:block!important;width:18px!important;height:18px!important;margin:0!important;transform:none!important}';
      style.textContent+='.cz-native-chat-time{display:inline!important;margin-right:6px!important;color:#89929f!important;font-size:10px!important;font-weight:400!important;line-height:inherit!important;white-space:nowrap!important}.cz-native-chat-header{height:40px!important;min-height:40px!important;padding:0 8px!important}.cz-native-chat-header #cz-chat-channel,.cz-native-chat-header #cz-chat-settings,.cz-native-chat-header .cz-native-settings{width:32px!important;min-width:32px!important;height:32px!important;min-height:32px!important;max-height:32px!important;flex:0 0 32px!important;box-sizing:border-box!important}.cz-native-chat-header #cz-chat-channel:before,.cz-native-chat-header #cz-chat-channel:after,.cz-native-chat-header #cz-chat-settings:before,.cz-native-chat-header #cz-chat-settings:after,.cz-native-settings:before,.cz-native-settings:after{content:none!important}.cz-native-settings{font-size:20px!important;line-height:1!important}.cz-native-settings svg{width:20px!important;height:20px!important}.cz-native-action-wrapper{position:relative!important;inset:auto!important;transform:none!important;align-self:center!important;align-items:center!important;min-height:32px!important;margin-top:0!important;margin-bottom:0!important}';
      (document.head||document.documentElement).appendChild(style);
    }
    nativeHeader(root);stampMessages(root);
    if(overlayOpen())root.querySelectorAll('.cz-chat-input-idle').forEach(el=>el.classList.remove('cz-chat-input-idle'));else stabilizeInput(document,root);
    return true;
  }
  function start(options={}) {
    onHeader=options.onHeader||onHeader;
    const apply = () => {
      document.querySelectorAll('video').forEach(v => { v.muted = true; v.volume = 0; try { v.pause(); } catch (_) {} });
      prepare();
    };
    apply();
    let scheduled=false;
    const report=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;const header=document.querySelector('.cz-native-chat-header');if(header)reportHeader(header);});};
    window.addEventListener('resize',report);document.addEventListener('scroll',report,true);
    const overlays=onHeader?new MutationObserver(report):null;overlays?.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden','aria-expanded']});
    document.addEventListener('click',event=>{const header=document.querySelector('.cz-native-chat-header');if(header && !header.contains(event.target))nativeMenuOpen=false;report();},true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){nativeMenuOpen=false;report();}},true);
    window.addEventListener('pagehide',()=>{overlays?.disconnect();timestampObserver?.disconnect();},{once:true});
    document.addEventListener('focusin',apply);document.addEventListener('focusout',()=>queueMicrotask(apply));document.addEventListener('input',apply);
    // DOM hydration can replace the replay/chat root after its first appearance.
    setInterval(apply, 1000);
  }
  return {start,setPresentation};
})();
