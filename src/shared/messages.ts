import type {PlayerEnvelope} from './contracts/protocol';
export const messages = (() => {
  const SOURCE = 'chzzk-multiview';
  const CHZZK_ORIGIN = 'https://chzzk.naver.com';
  const playerTypes = new Set(['POWER_DIAGNOSTICS_RESULT', 'PLAYER_READY', 'CHAT_READY', 'CHAT_SETTINGS_OPEN', 'CHAT_HEADER', 'IMPORTANT_CHAT_BATCH', 'IMPORTANT_CHAT_STATUS', 'VIDEO_STATE', 'SYNC_STATE', 'SYNC_RESULT', 'MEDIA_RESULT', 'MEDIA_STATE', 'MEDIA_TIME', 'MEDIA_KEY']);
  const commandTypes = new Set(['POWER_REWARDS_CONFIG', 'POWER_DIAGNOSTICS', 'CHAT_PRESENTATION', 'IMPORTANT_CHAT_CONFIG', 'SET_NAV_VISIBLE', 'SET_CHAT_MODE', 'SET_CHAT_VISIBLE', 'SET_MUTED', 'SET_VOLUME', 'ENTER_THEATER', 'SYNC_SEEK', 'MEDIA_SCREENSHOT', 'MEDIA_RECORD', 'MEDIA_STOP', 'MEDIA_SEEK','MEDIA_SHORTCUTS']);
  function isPlayerMessage(event: MessageEvent<unknown>, frame: HTMLIFrameElement | null): boolean {
    const data = event?.data as PlayerEnvelope | undefined;
    if (!frame || event.origin !== CHZZK_ORIGIN || event.source !== frame.contentWindow || data?.source !== SOURCE || !playerTypes.has(data.type) || typeof data.uid !== 'string') return false;
    if (data.type === 'VIDEO_STATE') return typeof data.muted === 'boolean' && Number.isFinite(data.volume) && typeof data.reason==='string' && ['player', 'command'].includes(data.reason);
    return true;
  }
  function postToPlayer(frame: HTMLIFrameElement | null, data: unknown) {
    if (!frame?.contentWindow || frame.dataset.playerReady !== 'true') return false;
    // Initial about:blank/error pages inherit the extension origin. Checking
    // their location is allowed; an actual CHZZK document is cross-origin.
    try { if (frame.contentWindow.location.origin !== CHZZK_ORIGIN) return false; }
    catch (_) { /* Cross-origin access is expected after CHZZK navigation. */ }
    frame.contentWindow.postMessage(data, CHZZK_ORIGIN);
    return true;
  }
  function mediaShortcut(event: KeyboardEvent) {
    if(event.altKey || event.ctrlKey || event.metaKey || event.isComposing)return null;
    const physical=event.code?.match(/^Key([SRFHBVGC])$/);
    const key=physical?physical[1]!.toLowerCase():String(event.key || '').toLowerCase();
    if(['s','r','f','h','b','v','g','c'].includes(key))return event.repeat?null:key;
    if(event.shiftKey)return null;
    return event.key==='ArrowLeft' || event.key==='ArrowRight'?event.key:null;
  }
  function isShortcutInput(event: Event,key?: string | null) {
    return event.composedPath().some(el=>(el as Element)?.matches?.(`input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.cg-dialog,.settings-panel,.ic-dialog${key?.startsWith('Arrow')?',input[type=range]':''}`));
  }
  function isParentCommand(event: MessageEvent, origin: string, parent: Window) {
    return event?.origin === origin && event.source === parent && event.data?.source === SOURCE && commandTypes.has(event.data.type);
  }
  return Object.freeze({SOURCE, CHZZK_ORIGIN, postToPlayer, mediaShortcut, isShortcutInput, isPlayerMessage, isParentCommand});
})();

globalThis.CZMessages=messages;
