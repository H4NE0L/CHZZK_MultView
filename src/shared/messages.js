globalThis.CZMessages = (() => {
  const SOURCE = 'chzzk-multiview';
  const CHZZK_ORIGIN = 'https://chzzk.naver.com';
  const playerTypes = new Set(['PLAYER_READY', 'CHAT_READY', 'VIDEO_STATE', 'CHANNEL_INFO', 'SYNC_STATE', 'SYNC_RESULT']);
  const commandTypes = new Set(['SET_NAV_VISIBLE', 'SET_CHAT_MODE', 'SET_CHAT_VISIBLE', 'SET_MUTED', 'SET_VOLUME', 'ENTER_THEATER', 'SYNC_SEEK']);
  function isPlayerMessage(event, frame) {
    const data = event?.data;
    if (!frame || event.origin !== CHZZK_ORIGIN || event.source !== frame.contentWindow || data?.source !== SOURCE || !playerTypes.has(data.type) || typeof data.uid !== 'string') return false;
    if (data.type === 'VIDEO_STATE') return typeof data.muted === 'boolean' && Number.isFinite(data.volume) && ['player', 'command'].includes(data.reason);
    return true;
  }
  function isParentCommand(event, origin, parent) {
    return event?.origin === origin && event.source === parent && event.data?.source === SOURCE && commandTypes.has(event.data.type);
  }
  return Object.freeze({SOURCE, CHZZK_ORIGIN, isPlayerMessage, isParentCommand});
})();
