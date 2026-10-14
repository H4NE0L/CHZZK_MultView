globalThis.CZMessages = (() => {
  const SOURCE = 'chzzk-multiview';
  const CHZZK_ORIGIN = 'https://chzzk.naver.com';
  const playerTypes = new Set(['PLAYER_READY', 'CHAT_READY', 'VIDEO_STATE', 'SYNC_STATE', 'SYNC_RESULT', 'MEDIA_RESULT', 'MEDIA_STATE', 'MEDIA_TIME', 'MEDIA_KEY']);
  const commandTypes = new Set(['SET_NAV_VISIBLE', 'SET_CHAT_MODE', 'SET_CHAT_VISIBLE', 'SET_MUTED', 'SET_VOLUME', 'ENTER_THEATER', 'SYNC_SEEK', 'MEDIA_SCREENSHOT', 'MEDIA_RECORD', 'MEDIA_STOP', 'MEDIA_SEEK','MEDIA_SHORTCUTS']);
  function isPlayerMessage(event, frame) {
    const data = event?.data;
    if (!frame || event.origin !== CHZZK_ORIGIN || event.source !== frame.contentWindow || data?.source !== SOURCE || !playerTypes.has(data.type) || typeof data.uid !== 'string') return false;
    if (data.type === 'VIDEO_STATE') return typeof data.muted === 'boolean' && Number.isFinite(data.volume) && ['player', 'command'].includes(data.reason);
    return true;
  }
  function postToPlayer(frame, data) {
    if (!frame?.contentWindow || frame.dataset.playerReady !== 'true') return false;
    // Initial about:blank/error pages inherit the extension origin. Checking
    // their location is allowed; an actual CHZZK document is cross-origin.
    try { if (frame.contentWindow.location.origin !== CHZZK_ORIGIN) return false; }
    catch (_) { /* Cross-origin access is expected after CHZZK navigation. */ }
    frame.contentWindow.postMessage(data, CHZZK_ORIGIN);
    return true;
  }
  function mediaShortcut(event) {
    if(event.altKey || event.ctrlKey || event.metaKey || event.isComposing)return null;
    const physical=event.code?.match(/^Key([SRFHBVGC])$/);
    const key=physical?physical[1].toLowerCase():String(event.key || '').toLowerCase();
    if(['s','r','f','h','b','v','g','c'].includes(key))return event.repeat?null:key;
    if(event.shiftKey)return null;
    return event.key==='ArrowLeft' || event.key==='ArrowRight'?event.key:null;
  }
  function isShortcutInput(event,key) {
    return event.composedPath().some(el=>el?.matches?.(`input:not([type=range]),textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.cg-dialog,.settings-panel${key?.startsWith('Arrow')?',input[type=range]':''}`));
  }
  function isParentCommand(event, origin, parent) {
    return event?.origin === origin && event.source === parent && event.data?.source === SOURCE && commandTypes.has(event.data.type);
  }
  return Object.freeze({SOURCE, CHZZK_ORIGIN, postToPlayer, mediaShortcut, isShortcutInput, isPlayerMessage, isParentCommand});
})();
