import {requestedChannels} from '../models/channel-input';
export function create(context) {
  const {tileMap,session,showNotice,saveState,applyLayout,updateChat,refreshChannelManager,syncSelection,updateLayoutToggle,
    isChannelVisibleInLayout,createTile,selectChannel,clearSyncState,clearAllSyncState,makeMainAudible,moveSelectedToFront,
    syncVolumeUI,createUI,refreshFavoriteList,refreshFavoriteOnlineStatus,applyFavoriteSnapshot}=context;
  const parseInput=CZSessionStore.parseInput,fetchChannelName=CZFavoritesStore.fetchChannelName;
  const safeTitle=uid=>`CHZZK ${uid}`;
  const uidFromInput=value=>parseInput(value)?.uid||null;
  const mediaTools=context.mediaTools;
  async function loadState(){await context.favorites.load();if(!session.ready)context.state=await CZSessionStore.read();}
  function addFromInput() {
    const ui=context.ui;
    const input = ui.querySelector("#uidInput");
    const parsed = parseInput(input.value);

    if (!parsed) {
      input.focus();
      input.classList.add("invalid");
      context.scope.timeout(() => input.classList.remove("invalid"), 500);
      return;
    }

    addChannel(parsed.uid, parsed);
    input.value = "";
    input.focus();
  }

  function addChannel(uid, parsed = { type: "live", id: uid, uid, url: `https://chzzk.naver.com/live/${encodeURIComponent(uid)}` }) {
    const state=context.state;
    if (state.channels.some(c => c.uid === uid)) {
      selectChannel(uid);
      return;
    }

    const favorites=context.favorites.items;
    const favorite = parsed.type === "live" ? favorites.find(f => f.uid === parsed.id) : null;
    const favoriteName = favorite?.name || favorite?.title || "";
    const channel = {
      uid,
      type: parsed.type,
      sourceId: parsed.id,
      url: parsed.url,
      title: favoriteName || (parsed.type === "video" ? `다시보기 ${parsed.id}` : safeTitle(parsed.id)),
      linkTitle: favoriteName || (parsed.type === "video" ? `다시보기 ${parsed.id}` : safeTitle(parsed.id)),
      name: favoriteName,
      muted: true,
      volume: 1
    };

    state.channels.push(channel);

    // Keep the currently selected layout. The layout controls are toggle buttons,
    // so adding a broadcast must not reset or overwrite the user's selection.
    updateLayoutToggle();

    if (!state.selectedUid) {
      state.selectedUid = uid;
    }

    // Create a player tile only when the current layout can display it.
    // Hidden broadcasts remain in state.channels but do not create/load an iframe.
    if (isChannelVisibleInLayout(channel.uid)) createTile(channel);
    refreshChannelManager();
    syncSelection();
    applyLayout();
    updateChat();
    saveState();

    // Resolve the permanent channel name independently of the live title.
    // This works even when the player document title is not ready yet.
    resolveChannelName(channel);
  }

  function resolveChannelName(channel) {
    const uid = channel.uid;
    (channel.type === "video" ? CZChzzkApi.fetchVideoChannelName(channel.sourceId) : fetchChannelName(channel.sourceId || uid)).then(async name => {
      if (!name || context.scope.isDisposed) return;
      const state=context.state;
      const current = state.channels.find(c => c.uid === uid);
      if (!current) return;
      current.name = name;
      current.title = name;
      const fav = context.favorites.items.find(f => f.uid === uid);
      if (fav && (fav.name !== name || fav.title !== name)) {
        fav.name = name;
        fav.title = name;
        try {
          applyFavoriteSnapshot(await CZFavoritesStore.writeInfo({[uid]: {name, title: name}}));
        } catch (error) { console.warn("방송 이름 저장 실패:", error); }
        refreshFavoriteList();
        refreshChannelManager();
      }
      if(context.scope.isDisposed)return;
      updateChat();
      // Publish the resolved name after its metadata write has settled.
      const nameEl = tileMap.get(uid)?.querySelector(".tile-streamer-name");
      if (nameEl) nameEl.textContent = name;
      refreshChannelManager();
      syncVolumeUI();
      saveState();
    }).catch(error => console.warn("방송 이름 조회 실패:", error));
  }

  function removeChannel(uid) {
    const state=context.state;
    if (mediaTools.isRecording(uid)) { showNotice("녹화를 중지하고 결과를 확인한 뒤 방송을 삭제하세요."); return; }
    if(!state.channels.some(channel=>channel.uid===uid))return;
    const selectedChanged=state.selectedUid===uid;
    const tile = tileMap.get(uid);
    // Reject queued messages before frame teardown; removing the frame itself
    // releases playback without starting a second about:blank navigation.
    tileMap.delete(uid);
    state.channels = state.channels.filter(c => c.uid !== uid);
    const iframe=tile?.querySelector("iframe");
    if(iframe)iframe.dataset.playerReady='false';
    mediaTools.detach(uid);
    clearSyncState(uid);
    tile?.remove();

    if (selectedChanged) {
      state.selectedUid = state.channels[0]?.uid || null;
      if (state.selectedUid && state.mainOnly) makeMainAudible();
    }

    applyLayout({audio:false});
    if(selectedChanged){
      syncSelection({audio:state.mainOnly,chrome:false});
      updateChat();
    }
    // applyLayout refreshes the list/volume UI without reloading surviving
    // players or rebroadcasting hide-chat and volume commands to every tile.

    saveState();
  }

  function clearAll() {
    const state=context.state;
    if(mediaTools.hasRecordings()){showNotice("녹화를 중지한 뒤 전체 삭제하세요.");return;}
    for (const [uid,tile] of tileMap) {
      const iframe = tile.querySelector("iframe");
      if (iframe) iframe.src = "about:blank";
      mediaTools.detach(uid);
      tile.remove();
    }
    tileMap.clear();
    clearAllSyncState();
    state.channels = [];
    state.selectedUid = null;
    refreshChannelManager();
    updateChat();
    applyLayout();
    saveState();
  }

  async function openMultiView(initialInput = "", initialInputs = []) {
    if(mediaTools.hasRecordings() && initialInputs.length) throw Error("녹화를 중지한 뒤 방송 목록을 교체하세요.");
    await loadState();
    if(context.scope.isDisposed)return;

    const state=context.state,favorites=context.favorites.items;
    const hasPopupList = Array.isArray(initialInputs) && initialInputs.length > 0;
    const popupInputs = hasPopupList ? initialInputs : (initialInput ? [initialInput] : []);

    if (hasPopupList) {
      // When the popup has an explicit MultiView list, that list is the
      // requested session. Do not mix it with broadcasts restored from the
      // previous session.
      state.channels=requestedChannels(popupInputs,state.channels,favorites);
    } else if (initialInput) {
      // A direct input is treated as a new requested broadcast in addition to
      // the restored session only when it is explicitly supplied.
      const uid = uidFromInput(initialInput);
      if (uid && !state.channels.some(c => c.uid === uid)) {
        state.channels.push({ uid, title: safeTitle(uid), linkTitle: safeTitle(uid), name: "", muted: true, volume: 1 });
      }
    }

    // Only a fresh viewer launch resets audio; updating an open viewer keeps it.
    if (!session.ready) state.channels.forEach(channel => {channel.volume = 0.1; channel.muted = true;});

    if (!state.channels.some(c => c.uid === state.selectedUid)) state.selectedUid = state.channels[0]?.uid || null;
    if (state.layout === "main-sub") moveSelectedToFront();
    // Drop only removed tiles; retain surviving iframe instances and audio state.
    for (const [uid, tile] of tileMap) {
      if (state.channels.some(c => c.uid === uid)) continue;
      mediaTools.detach(uid);
      tile.remove();
      tileMap.delete(uid);
      clearSyncState(uid);
    }
    saveState();

    createUI();
    refreshFavoriteList();
    refreshFavoriteOnlineStatus(false).catch(console.warn);
    state.channels.forEach(resolveChannelName);

    syncSelection();
    applyLayout();
    updateChat();

    // If a direct input was supplied, it has already been added above. For
    // popup lists, the requested list has likewise replaced the restored list.


  }

  function addFavorite(favorite){
    if(favorite && !context.state.channels.some(channel=>channel.uid===favorite.uid))addChannel(favorite.uid,{type:'live',id:favorite.uid,uid:favorite.uid,url:`https://chzzk.naver.com/live/${encodeURIComponent(favorite.uid)}`});
  }
  return {addFromInput,addChannel,removeChannel,clearAll,resolveChannelName,open:openMultiView,addFavorite};
}
