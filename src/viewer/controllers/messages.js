export function bind(context) {
  const {scope,tileMap,powerDiagnostics,clearSyncState,sendTileVolume,mediaTools,receiveVideoState,handleSyncState,handleSyncResult}=context;
  scope.listen(window,"message", event => {
    const {chatFrame,importantChat,state}=context;
    const data = event.data;
    const fromChat=['CHAT_READY','IMPORTANT_CHAT_BATCH','IMPORTANT_CHAT_STATUS','CHAT_SETTINGS_OPEN','CHAT_HEADER'].includes(data?.type) || data?.type==='MEDIA_KEY' && event.source===chatFrame?.contentWindow;
    const frame = fromChat ? chatFrame : tileMap.get(data?.uid)?.querySelector('iframe');
    if (!CZMessages.isPlayerMessage(event, frame) || fromChat && data.uid!==chatFrame?.dataset.uid) return;
    if(data.type==='POWER_DIAGNOSTICS_RESULT'){powerDiagnostics.receive(data);return;}
    if(data.type==='CHAT_SETTINGS_OPEN'){importantChat?.openSettings();return;}
    if(data.type==='CHAT_HEADER')return;
    if(data.type==='IMPORTANT_CHAT_STATUS'){importantChat?.status(data.stats);return;}
    if(data.type==='IMPORTANT_CHAT_BATCH'){importantChat?.receive(data);return;}
    if (data.type === 'CHAT_READY') {
      if (data.uid !== chatFrame?.dataset.uid) return;
      frame.dataset.playerReady = 'true';
      importantChat?.sync(true);
      CZMessages.postToPlayer(frame,{source:'chzzk-multiview',type:'MEDIA_SHORTCUTS',enabled:state.shortcutsEnabled!==false});
      CZMessages.postToPlayer(frame, {source: 'chzzk-multiview', type: 'SET_CHAT_MODE', visible: true});
    } else if (data.type === 'PLAYER_READY') {
      frame.dataset.playerReady = 'true';
      CZMessages.postToPlayer(frame,{source:'chzzk-multiview',type:'MEDIA_SHORTCUTS',enabled:state.shortcutsEnabled!==false});
      clearSyncState(data.uid);
      sendTileVolume(data.uid);
      CZMessages.postToPlayer(frame, {source: 'chzzk-multiview', type: 'ENTER_THEATER'});
      CZMessages.postToPlayer(frame, {source: 'chzzk-multiview', type: 'SET_CHAT_VISIBLE', visible: false});
    } else if (data.type.startsWith('MEDIA_')) mediaTools.receive(data);
    else if (data.type === 'VIDEO_STATE') receiveVideoState(data);
    else if (data.type === 'SYNC_STATE') handleSyncState(data);
    else if (data.type === 'SYNC_RESULT') handleSyncResult(data);
  });

}
