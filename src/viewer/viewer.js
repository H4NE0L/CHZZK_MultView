import {audio as CZAudio} from './audio.js';
import {chat as CZChat} from './chat.js';
import {players as CZPlayers} from './players.js';
import {sync as CZSync} from './sync.js';
import {mediaTools as CZMediaTools} from './media-tools.js';
import {powerDiagnostics as CZPowerDiagnostics} from './power-diagnostics.js';
import {importantChatPanel as CZImportantChatPanel} from './important-chat.js';
import {create as createLayout} from './layout';
import {ResourceScope} from '../shared/runtime/scope';
import {mount as mountView} from './controllers/view.js';
import {bind as bindControls} from './controllers/controls.js';
import {bind as bindMessages} from './controllers/messages.js';
import {create as createShell} from './controllers/shell.js';
import {create as createChannels} from './controllers/channels.js';
import {create as createSession} from './controllers/session';
import {create as createFavorites} from './controllers/favorites.js';
import {create as createVolumePanel} from './controllers/volume-panel.js';
import {create as createChannelList} from './controllers/channel-list.js';
(() => {
  if (window.top !== window) return;
  if (window.__CHZZK_MULTIVIEW_PAGE_LOADED__) return;
  window.__CHZZK_MULTIVIEW_PAGE_LOADED__ = true;

  const scope=new ResourceScope();

  const ROOT_ID = "__chzzk_multiview_v09__";

  const DEFAULT_STATE = CZSessionStore.DEFAULT_STATE;

  let state = { ...DEFAULT_STATE };
  let ui = null;
  let videoGrid = null;
  let chatPanel = null;
  let chatFrame = null;
  let importantChat = null;
  let tileMap = new Map();
  let dragUid = null;

  function displayChannelName(channel) {
    return channel?.name || (channel?.title && !channel.title.startsWith("CHZZK ") ? channel.title : channel?.uid || "");
  }


  const session=createSession({get state(){return state;},scope,open:inputs=>openMultiView('',inputs)});
  function saveState(){session.save();}
  function saveStateSoon(){session.saveSoon();}

  const shell=createShell({get state(){return state;},get ui(){return ui;},scope,tileMap,saveState,
    applyLayout:(...args)=>applyLayout(...args),updateChat:(...args)=>updateChat(...args),resizeFixedAspectGrid:(...args)=>resizeFixedAspectGrid(...args)});
  const {applyTileLock,setScreenLock,toggleScreenLock,toggleToolbar,updateToolbarToggleUI,setChatSide,toggleChatSide,setChatOpen,toggleChat,showNotice}=shell;

  function createUI(){
    const mounted=mountView({rootId:ROOT_ID,siteMode:!!globalThis.CZ_SITE_VIEWER});if(!mounted)return;
    ({ui,videoGrid,chatPanel}=mounted);
    mediaTools.bindSettings();
    importantChat=CZImportantChatPanel.create({chatPanel,enabledControl:ui.querySelector('#importantChatEnabled'),getFrame:()=>chatFrame,getState:()=>state,notify:showNotice});
    scope.add(()=>importantChat.dispose());
    scope.frame(()=>{mvResizeObserver.observe(videoGrid);mvResizeObserver.observe(ui);});
    bindControls({mediaTools,get state(){return state;},ui,addFromInput,clearAll,favoriteController,toggleToolbar,toggleChat,toggleChatSide,toggleScreenLock,scope,saveState,syncShortcutSettings,
      importantChat,powerDiagnostics,volumePanel,renderSyncUI,resetAllSync,adjustSync,resetSync,moveSelectedToFront,applyLayout,
      updateLayoutToggle,refreshFavoriteList,refreshChannelManager,setChatOpen,setChatSide,setScreenLock,updateToolbarToggleUI,syncVolumeUI});
  }

  const favoriteController=createFavorites({scope,get ui(){return ui;},get state(){return state;},showNotice,refreshChannelManager,escapeHtml,addFavorite:addToListFromFavorite});
  const volumePanel=createVolumePanel({get ui(){return ui;},get state(){return state;},get audio(){return audio;},displayChannelName,escapeHtml});
  const channelList=createChannelList({get ui(){return ui;},get state(){return state;},scheduleSyncRender:(...args)=>scheduleSyncRender(...args),escapeHtml,displayChannelName,
    refreshActive:()=>favoriteController.refreshActive(),isFavorite:uid=>favoriteController.isFavorite(uid),toggleFavorite:(...args)=>favoriteController.toggle(...args),removeChannel});
  function applyFavoriteSnapshot(snapshot){favoriteController.apply(snapshot);}
  function refreshFavoriteList(){favoriteController.refresh();}
  function refreshFavoriteOnlineStatus(...args){return favoriteController.refreshOnline(...args);}
  function refreshChannelManager(){channelList.refresh();}
  function syncVolumeUI(){volumePanel.sync();}
  function refreshVolumeManager(){volumePanel.refresh();}

  const {isChannelVisibleInLayout,createTile,moveSelectedToFront,selectChannel,syncSelection} = CZPlayers.create({get mediaTools() {return mediaTools;}, get state() {return state;}, get videoGrid() {return videoGrid;}, get dragUid() {return dragUid;}, set dragUid(value) {dragUid = value;}, tileMap, escapeHtml: (...args) => escapeHtml(...args), displayChannelName: (...args) => displayChannelName(...args), removeChannel: (...args) => removeChannel(...args), showNotice: (...args) => showNotice(...args), applyLayout: (...args) => applyLayout(...args), updateChat: (...args) => updateChat(...args), refreshChannelManager: (...args) => refreshChannelManager(...args), saveState: (...args) => saveState(...args), applyTileLock: (...args) => applyTileLock(...args), syncVolumeUI: (...args) => syncVolumeUI(...args), clearSyncState: (...args) => clearSyncState(...args), sendTileVolume: (...args) => sendTileVolume(...args), makeMainAudible: (...args) => makeMainAudible(...args)});

  let unmuteRequest=null;
  function ensureViewerAudible(){
    if(unmuteRequest)return;
    unmuteRequest=chrome.runtime.sendMessage({type:'UNMUTE_VIEWER_TAB',tabId:session.tabId}).then(result=>{if(!result?.ok)showNotice('브라우저 탭 음소거 해제 실패: '+(result?.error || '탭 상태를 확인해주세요.'));}).catch(error=>showNotice('탭 음소거 상태 확인 실패: '+error.message)).finally(()=>{unmuteRequest=null;});
  }
  const audio = CZAudio.create({ensureAudible:ensureViewerAudible,get state() { return state; }, tileMap, syncVolumeUI, saveStateSoon, saveState});
  const {sendTileVolume,makeMainAudible,receiveVideoState} = audio;

  /* ------------------------------------------------------------------
     Manual sync (싱크 조정)
     Each broadcast's playhead can be pulled back (-) or pushed forward (+)
     in 0.1 / 0.5 second steps. The adjustment is the sum of what the player
     really applied (it can be limited by the live edge or the start of the
     seekable window). It is runtime-only: a reloaded player starts at 0.
  ------------------------------------------------------------------ */
  const {externalSeek, adjustSync, resetSync, resetAllSync, clearSyncState, clearAllSyncState, handleSyncResult, handleSyncState, scheduleSyncRender, renderSyncUI} = CZSync.create({get state() {return state;}, get ui() {return ui;}, tileMap, showNotice, escapeHtml, displayChannelName});

  function syncShortcutSettings() {
    CZMessages.postToPlayer(chatFrame,{source:'chzzk-multiview',type:'MEDIA_SHORTCUTS',enabled:state.shortcutsEnabled!==false});
    for(const tile of tileMap.values())CZMessages.postToPlayer(tile.querySelector('iframe'),{source:'chzzk-multiview',type:'MEDIA_SHORTCUTS',enabled:state.shortcutsEnabled!==false});
  }
  function handleShortcut(key) {
    if(state.shortcutsEnabled===false)return;
    if(['f','v'].includes(key)){
      const collapsed=shell.collapsed;if(collapsed)toggleToolbar();
      const panel=ui.querySelector(key==='f'?'#favoriteManager':'#volumeManager');panel.open=collapsed || !panel.open;
      if(panel.open)ui.querySelector('#settingsManager').removeAttribute('open');
    }else if(key==='h')toggleScreenLock();
    else if(key==='b')toggleToolbar();
    else if(key==='c')toggleChat();
    else if(key==='g')ui.querySelector(`.layout-toggle-btn[data-layout="${state.layout==='grid'?'main-sub':'grid'}"]`).click();
  }
  const powerDiagnostics=CZPowerDiagnostics.create({get state(){return state;},get ui(){return ui;},tileMap});
  const mediaTools = CZMediaTools.create({get shortcutsEnabled(){return state.shortcutsEnabled!==false;},onShortcut:handleShortcut,get state() {return state;}, get ui() {return ui;}, tileMap, showNotice, adjustSync, externalSeek});

  scope.add(()=>mediaTools.dispose());
  bindMessages({scope,tileMap,powerDiagnostics,clearSyncState,sendTileVolume,mediaTools,receiveVideoState,handleSyncState,handleSyncResult,
    get state(){return state;},get chatFrame(){return chatFrame;},get importantChat(){return importantChat;}});

  const {updateLayoutToggle,applyLayout,resizeFixedAspectGrid}=createLayout({
    get state(){return state;},get ui(){return ui;},get videoGrid(){return videoGrid;},
    tileMap,scope,onRemove:uid=>mediaTools.detach(uid),createTile,sendTileVolume,applyTileLock,refreshChannelManager,refreshVolumeManager
  });

  const {updateChat} = CZChat.create({onUpdated:()=>importantChat?.sync(),get state() {return state;}, get chatPanel() {return chatPanel;}, get chatFrame() {return chatFrame;}, set chatFrame(value) {chatFrame = value;}});

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const channels=createChannels({get state(){return state;},set state(value){state=value;},get ui(){return ui;},scope,tileMap,session,mediaTools,
    favorites:favoriteController,showNotice,saveState,applyLayout,updateChat,refreshChannelManager,syncSelection,updateLayoutToggle,
    isChannelVisibleInLayout,createTile,selectChannel,clearSyncState,clearAllSyncState,makeMainAudible,moveSelectedToFront,
    syncVolumeUI,createUI,refreshFavoriteList,refreshFavoriteOnlineStatus,applyFavoriteSnapshot});
  function addFromInput(){channels.addFromInput();}
  function removeChannel(uid){channels.removeChannel(uid);}
  function clearAll(){channels.clearAll();}
  function addToListFromFavorite(favorite){channels.addFavorite(favorite);}
  function openMultiView(...args){return channels.open(...args);}

  const boot = async () => {
    await session.register(!!globalThis.CZ_SITE_VIEWER);
    const query = new URL(location.href).searchParams;
    let inputs = [];
    if (!globalThis.CZ_SITE_VIEWER && query.has('inputs')) inputs = JSON.parse(query.get('inputs'));
    await chrome.runtime.sendMessage({type: 'COOKIE_BRIDGE_INIT'});
    await openMultiView('', Array.isArray(inputs) ? inputs : []);
    // Explicit launch inputs apply once; refreshing restores the saved session.
    if(!globalThis.CZ_SITE_VIEWER)history.replaceState(null, '', location.pathname);
    session.markReady();
    if(!globalThis.CZ_SITE_VIEWER)document.body.classList.add('ready');
  };
  boot().catch(error => {
    console.error(error);
    scope.dispose();
    document.getElementById(ROOT_ID)?.remove();
    if(document.getElementById('startupStatus'))document.getElementById('startupStatus').textContent = '멀티뷰를 열지 못했습니다. 확장을 다시 로드한 뒤 페이지를 새로고침해주세요.';
  });
  scope.listen(window,'pagehide', event => {saveState();if(!event.persisted)scope.dispose();});

  const scheduleGridResize = () => {
    resizeFixedAspectGrid();
  };

  const mvResizeObserver = new ResizeObserver(scheduleGridResize);
  scope.observe(mvResizeObserver);
  // A maximized browser can change its CSS viewport when moved between
  // monitors with different resolutions/scaling. Recalculate immediately.
  scope.listen(window,"resize", scheduleGridResize, { passive: true });
  if (window.visualViewport) {
    scope.listen(window.visualViewport,"resize", scheduleGridResize, { passive: true });
  }


})();
