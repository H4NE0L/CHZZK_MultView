(() => {
  if (window.top !== window) return;
  if (window.__CHZZK_MULTIVIEW_PAGE_LOADED__) return;
  window.__CHZZK_MULTIVIEW_PAGE_LOADED__ = true;

  const ROOT_ID = "__chzzk_multiview_v09__";
  const DEFAULT_FAVORITE_GROUP = CZFavoritesStore.DEFAULT_GROUP;

  const DEFAULT_STATE = CZSessionStore.DEFAULT_STATE;

  let state = { ...DEFAULT_STATE };
  let shadowRoot = null;
  let ui = null;
  let videoGrid = null;
  let chatPanel = null;
  let chatFrame = null;
  let tileMap = new Map();
  let dragUid = null;
  let toolbarCollapsed = false;
  let favorites = [];
  let favoriteGroups = [DEFAULT_FAVORITE_GROUP];
  let groupManager = null;
  let saveTimer = null;
  let volumeListSig = "";
  let activeRange = null;

  const ICON_CHEVRON_UP = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  const ICON_CHEVRON_DOWN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const ICON_SPEAKER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_SPEAKER_MUTED = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function chatSideIcon(side) {
    const x = side === "left" ? 3 : 15;
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="${x}" y="4" width="6" height="16" rx="1" fill="currentColor" stroke="none"/></svg>`;
  }

  const parseInput = CZSessionStore.parseInput;

  function uidFromInput(value) {
    return parseInput(value)?.uid || null;
  }

  function safeTitle(uid) {
    return `CHZZK ${uid}`;
  }

  const fetchChannelName = CZFavoritesStore.fetchChannelName;

  function displayChannelName(channel) {
    return channel?.name || (channel?.title && !channel.title.startsWith("CHZZK ") ? channel.title : channel?.uid || "");
  }


function saveState() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  try {
    // 확장 프로그램 컨텍스트가 유효하지 않으면 저장을 시도하지 않는다.
    if (!chrome?.runtime?.id || !chrome?.storage?.local) return;

    CZSessionStore.write(state).catch(error => console.warn("멀티뷰 상태 저장 실패:", error));

  } catch (error) {
    const message = String(error?.message || error);

    if (message.includes("Extension context invalidated")) return;

    console.warn("멀티뷰 상태 저장 실패:", error);
  }
}

  // Slider drags fire many events; write to storage once the drag settles.
  function saveStateSoon() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 300);
  }


  function applyFavoriteSnapshot(snapshot) {
    favorites = snapshot.favorites;
    favoriteGroups = snapshot.groups;
  }

  function ensureFavoriteGroups() {
    applyFavoriteSnapshot(CZFavoritesStore.snapshot(favorites, favoriteGroups));
  }

  async function loadFavorites() {
    const snapshot = await CZFavoritesStore.read();
    favorites = snapshot.favorites;
    favoriteGroups = snapshot.groups;
  }

  async function loadState() {
    // Favorites are independent of the saved session, so always load them.
    await loadFavorites();

    state = await CZSessionStore.read();
  }

  function createUI() {
    if (document.getElementById(ROOT_ID)) {
      const existing = document.getElementById(ROOT_ID);
      existing.style.display = "block";

      return;
    }

    const host = document.createElement("div");
    host.id = ROOT_ID;
    document.body.appendChild(host);
    if(globalThis.CZ_SITE_VIEWER){
      host.style.cssText='position:fixed;inset:0;z-index:2147483647';
      document.querySelectorAll('video').forEach(video=>{video.muted=true;video.pause();});
    }
    shadowRoot = host.attachShadow({ mode: "open" });

    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = chrome.runtime.getURL("src/viewer/viewer.css");
    shadowRoot.appendChild(style);
    const groupStyle = document.createElement('link');
    groupStyle.rel = 'stylesheet'; groupStyle.href = chrome.runtime.getURL('src/shared/group-manager.css');
    shadowRoot.appendChild(groupStyle);

    ui = document.createElement("div");
    ui.className = "mv-root";
    ui.innerHTML = `
      <header class="mv-toolbar">
        <div class="toolbar-left">
          <details id="followingManager" class="favorite-manager"><summary>팔로잉</summary><div class="favorite-manager-panel"><div id="followingList"></div></div></details>
          <details id="favoriteManager" class="favorite-manager">
            <summary>즐겨찾기</summary>
            <div class="favorite-manager-panel">
              <div class="favorite-manager-tools">
                <button id="favoriteManageGroups" type="button">그룹 관리</button>
                <button id="favoriteRefresh" type="button" title="온라인 상태 새로고침">↻</button>
              </div>
              <div id="favoriteList" class="favorite-list"></div>
            </div>
          </details>
          <div class="add-area">
            <input id="uidInput" placeholder="방송 URL 또는 UID">
            <button id="addBtn" class="accent">방송 추가</button>
          </div>
          <details id="channelManager" class="channel-manager">
            <summary>방송 목록</summary>
            <div class="channel-manager-panel">
              <div class="channel-manager-head"><strong>현재 방송</strong><button id="clearBtn" class="manager-clear">전체 삭제</button></div>
              <div id="channelList" class="channel-list"></div>
            </div>
          </details>
        </div>

        <div class="toolbar-center" aria-hidden="true"></div>

        <div class="toolbar-right">
          <details id="syncManager" class="volume-manager sync-manager">
            <summary>싱크<span id="syncBadge" class="sync-badge" hidden></span></summary>
            <div class="volume-manager-panel sync-panel">
              <div class="sync-summary">
                <div class="sync-summary-head">
                  <strong>싱크 조정 현황</strong>
                  <button id="syncResetAll" type="button" class="manager-clear" disabled>전체 초기화</button>
                </div>
                <div id="syncSummaryList" class="sync-summary-list"></div>
              </div>
              <p class="volume-help">- 버튼은 방송을 뒤로 당기고(되감기, 지연 증가), + 버튼은 앞으로 밀어 라이브에 더 가깝게 합니다. 조정값은 저장되지 않으며 방송이 다시 로드되면 0으로 돌아갑니다.</p>
              <div id="syncList" class="sync-list"></div>
            </div>
          </details>
          <details id="volumeManager" class="volume-manager">
            <summary>볼륨</summary>
            <div class="volume-manager-panel">
              <div class="volume-row volume-master-row">
                <div class="master-volume-top">
                  <button type="button" id="masterMuteBtn" class="tile-mute-btn" title="전체 음소거"></button>
                  <label for="masterVolume">전체 볼륨 <output id="masterVolumeValue">100%</output></label>
                </div>
                <input id="masterVolume" type="range" min="0" max="100" value="100" step="1">
                <p class="volume-help">확장프로그램 전체 음량입니다. 아래 방송별 볼륨에 곱해져 적용되며, 방송별 설정값은 바뀌지 않습니다.</p>
              </div>
              <label class="main-only-check" for="mainOnlyCheck">
                <input id="mainOnlyCheck" type="checkbox">
                <span class="main-only-text">
                  <strong>메인만 듣기</strong>
                  <small>체크하면 메인 방송의 소리만 재생하고 나머지 방송은 음소거합니다. 해제하면 각 방송이 기존 설정대로 돌아옵니다.</small>
                </span>
              </label>
              <div id="tileVolumeList" class="tile-volume-list"></div>
            </div>
          </details>
          <div id="layoutToggle" class="layout-toggle" role="group" aria-label="레이아웃">
            <button type="button" class="layout-toggle-btn" data-layout="grid">그리드</button>
            <button type="button" class="layout-toggle-btn" data-layout="main-sub">레이드 뷰</button>
          </div>
          <button id="chatSideBtn" class="icon-btn" type="button"></button>
          <button id="chatToggleBtn" title="채팅 닫기/열기 (C)">채팅 닫기</button>
          <details id="settingsManager" class="viewer-settings"><summary title="설정">⚙ 설정</summary><div class="settings-panel"><strong>설정</strong><label class="settings-option"><span>멀티뷰 단축키 사용</span><span class="settings-switch"><input id="shortcutsEnabled" type="checkbox" role="switch" aria-label="멀티뷰 단축키 사용" aria-describedby="shortcutsDescription"><span class="settings-switch-track" aria-hidden="true"></span></span></label><p id="shortcutsDescription">즐겨찾기·화면 잠금·상단바·소리·배치·채팅 및 방향키 단축키를 켜거나 끕니다. 스크린샷 S와 녹화 R은 항상 사용할 수 있습니다.</p></div></details>
        </div>
      </header>

      <div id="centerControls" class="center-controls">
        <button id="screenLockBtn" class="center-btn" type="button" title="플레이어 조작 잠금">화면 잠금</button>
        <button id="collapseBtn" class="center-btn center-collapse" type="button" title="멀티뷰 메뉴 접기" aria-label="멀티뷰 메뉴 접기"></button>
      </div>

      <section class="mv-body">
        <div id="videoGrid" class="video-grid"></div>

        <aside id="chatPanel" class="chat-panel">
          <div class="chat-head">
            <strong>채팅</strong><button id="chatOriginalBtn" type="button" title="채팅 수집 확장을 사용할 원본 방송을 별도 탭에서 열기">원본 방송 열기</button>
          </div>
          <div class="chat-frame-wrap">
            <div id="chatEmpty" class="chat-empty">
              메인 방송을 선택하면<br>실제 CHZZK 채팅을 불러옵니다.
            </div>
          </div>
        </aside>
      </section>
    `;

    shadowRoot.appendChild(ui);
    if(globalThis.CZ_SITE_VIEWER){
      const exit=document.createElement('button');exit.textContent='치지직으로 돌아가기';exit.id='siteReturnBtn';exit.className='center-btn';exit.type='button';exit.onclick=()=>location.reload();ui.querySelector('#centerControls').appendChild(exit);ui.querySelector('#centerControls').classList.add('has-site-return');
    }

    videoGrid = ui.querySelector("#videoGrid");
    chatPanel = ui.querySelector("#chatPanel");
    requestAnimationFrame(() => { mvResizeObserver.observe(videoGrid); mvResizeObserver.observe(ui); });

    ui.querySelector("#addBtn").addEventListener("click", addFromInput);
    ui.querySelector("#clearBtn").addEventListener("click", clearAll);
    groupManager = CZGroupManager.attach({root: ui, getActiveChannels: () => state.channels,
      onSaved: snapshot => { applyFavoriteSnapshot(snapshot); refreshFavoriteList(); refreshChannelManager(); },
      onAdd: channel => addToListFromFavorite(channel),
      onOpen: kind => { for (const id of ['syncManager','volumeManager','channelManager']) ui.querySelector(`#${id}`)?.removeAttribute('open'); if(kind==='following') ui.querySelector('#favoriteManager').removeAttribute('open'); }
    });
    ui.querySelector('#followingManager').addEventListener('toggle', () => {if(ui.querySelector('#followingManager').open) ui.querySelector('#favoriteManager').removeAttribute('open');});
    ui.querySelector('#favoriteManager').addEventListener('toggle', () => {if(ui.querySelector('#favoriteManager').open) ui.querySelector('#followingManager').removeAttribute('open');});
    ui.querySelector('#favoriteManageGroups').addEventListener('click', () => groupManager.open().catch(error => showNotice(error.message)));

    // Storage is shared across popup and multiview; never write on change notification.
    let syncPending = false;
    CZFavoritesStore.subscribe(() => {
      if (syncPending) return;
      syncPending = true;
      queueMicrotask(async () => {
        syncPending = false;
        try {
          await loadFavorites();
          refreshFavoriteList();
          groupManager.sync();
        } catch (err) { console.warn("즐겨찾기 동기화 실패:", err); }
      });
    });

    ui.querySelector("#favoriteRefresh").addEventListener("click", async () => {
      const btn = ui.querySelector("#favoriteRefresh");
      btn.disabled = true;
      let persist = true;
      try {
        try {
          await loadFavorites();
        } catch (error) {
          if (!isExtensionContextInvalidated(error)) throw error;
          // The extension connection cannot be revived by retrying it. Keep
          // the visible list and fetch live status without writing stale data.
          persist = false;
        }
        refreshFavoriteList();
        if (!favorites.length) {
          showNotice(persist
            ? "새로고침할 즐겨찾기 방송이 없습니다."
            : "확장 연결이 끊겼으며 현재 화면에 조회할 즐겨찾기가 없습니다.");
          return;
        }

        await refreshFavoriteOnlineStatus(true, { persist });
      } catch (error) {
        console.error("즐겨찾기 새로고침 실패:", error);
        showNotice(persist
          ? "즐겨찾기 새로고침에 실패했습니다. 기존 표시 상태를 유지합니다."
          : "확장 연결이 끊긴 상태에서 방송 상태 조회도 실패했습니다. 기존 표시 상태를 유지합니다.");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    ui.querySelector("#collapseBtn").addEventListener("click", toggleToolbar);
    ui.querySelector("#chatToggleBtn").addEventListener("click", toggleChat);
    ui.querySelector('#chatOriginalBtn').onclick=async()=>{
      const channel=state.channels.find(c=>c.uid===state.selectedUid);
      if(!channel){showNotice('메인 방송을 먼저 선택하세요.');return;}
      try {const url=CZSessionStore.parseInput(channel.url || channel.uid)?.url;if(!url)return;
        if(globalThis.CZ_SITE_VIEWER){const result=await chrome.runtime.sendMessage({type:'SITE_OPEN_ORIGINAL',url});if(!result?.ok)throw Error(result?.error || '탭 열기 실패');}else{const tab=await chrome.tabs.create({url,active:true});await chrome.tabs.update(tab.id,{muted:true});}
        showNotice('원본 방송을 음소거 탭으로 열었습니다. 채팅 수집은 해당 탭에서 확인하세요.');
      }catch(error){showNotice('원본 방송 열기 실패: '+error.message);}
    };
    ui.querySelector("#chatSideBtn").addEventListener("click", toggleChatSide);
    ui.querySelector("#screenLockBtn").addEventListener("click", toggleScreenLock);

    const shortcutInput=ui.querySelector('#shortcutsEnabled');shortcutInput.checked=state.shortcutsEnabled!==false;
    shortcutInput.onchange=()=>{state.shortcutsEnabled=shortcutInput.checked;syncShortcutSettings();saveState();};
    ui.querySelector('#settingsManager').addEventListener('toggle',event=>{if(event.target.open)for(const id of ['favoriteManager','followingManager','syncManager','volumeManager','channelManager'])ui.querySelector('#'+id)?.removeAttribute('open');});
    for(const id of ['favoriteManager','followingManager','syncManager','volumeManager','channelManager'])ui.querySelector('#'+id).addEventListener('toggle',event=>{if(event.target.open)ui.querySelector('#settingsManager').removeAttribute('open');});
    const masterInput = ui.querySelector("#masterVolume");
    masterInput.addEventListener("input", e => setMasterVolume(Number(e.target.value) / 100));
    bindRangeDrag(masterInput);
    ui.querySelector("#mainOnlyCheck").addEventListener("change", e => setMainOnly(e.target.checked));

    // Only one of the sync / volume panels is open at a time (both are right-aligned).
    ui.querySelector("#syncManager").addEventListener("toggle", e => {
      if (!e.target.open) return;
      ui.querySelector("#volumeManager")?.removeAttribute("open");
      renderSyncUI();
    });
    ui.querySelector("#volumeManager").addEventListener("toggle", e => {
      if (e.target.open) ui.querySelector("#syncManager")?.removeAttribute("open");
    });
    ui.querySelector("#syncResetAll").addEventListener("click", resetAllSync);
    ui.querySelector("#syncList").addEventListener("click", e => {
      const btn = e.target.closest("button");
      const uid = btn?.closest(".sync-row")?.dataset.uid;
      if (!btn || !uid || btn.disabled) return;
      if (btn.dataset.step) adjustSync(uid, Number(btn.dataset.step));
      else if (btn.dataset.reset !== undefined) resetSync(uid);
    });
    ui.querySelector("#masterMuteBtn").addEventListener("click", e => { e.preventDefault(); toggleMasterMute(); });

    ui.querySelector("#uidInput").addEventListener("keydown", e => {
      if (e.key === "Enter") addFromInput();
    });

    ui.querySelectorAll(".layout-toggle-btn").forEach(button => {
      button.addEventListener("click", () => {
        const nextLayout = button.dataset.layout;
        if (!["grid", "main-sub"].includes(nextLayout)) return;
        if (state.layout === nextLayout) return;
        state.layout = nextLayout;
        // The raid view always shows the current main broadcast in the big slot.
        if (nextLayout === "main-sub") moveSelectedToFront();
        applyLayout();
        saveState();
      });
    });

    if (state.layout === "2x2" || state.layout === "3x3") state.layout = "grid";
    if (state.layout !== "grid" && state.layout !== "main-sub") state.layout = "grid";
    updateLayoutToggle();
    refreshFavoriteList();
    refreshChannelManager();
    setChatOpen(state.chatOpen !== false);
    setChatSide(state.chatSide, false);
    setScreenLock(state.screenLocked === true, false);
    updateToolbarToggleUI();
    syncVolumeUI();
    renderSyncUI();
    setInterval(updateFavoriteMeta, 1000);
    setInterval(() => {
      if (favoriteRefreshInFlight || ui.querySelector('[data-dragging="true"]')) return;
      refreshFavoriteOnlineStatus(false).catch(error => console.warn("즐겨찾기 자동 상태 조회 실패:", error));
    }, 30000);

  }

  function addFromInput() {
    const input = ui.querySelector("#uidInput");
    const parsed = parseInput(input.value);

    if (!parsed) {
      input.focus();
      input.classList.add("invalid");
      setTimeout(() => input.classList.remove("invalid"), 500);
      return;
    }

    addChannel(parsed.uid, parsed);
    input.value = "";
    input.focus();
  }

  function addChannel(uid, parsed = { type: "live", id: uid, uid, url: `https://chzzk.naver.com/live/${encodeURIComponent(uid)}` }) {
    if (state.channels.some(c => c.uid === uid)) {
      selectChannel(uid);
      return;
    }

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
      if (!name) return;
      const current = state.channels.find(c => c.uid === uid);
      if (!current) return;
      current.name = name;
      current.title = name;
      const fav = favorites.find(f => f.uid === uid);
      if (fav && (fav.name !== name || fav.title !== name)) {
        fav.name = name;
        fav.title = name;
        try {
          applyFavoriteSnapshot(await CZFavoritesStore.writeInfo({[uid]: {name, title: name}}));
        } catch (error) { console.warn("방송 이름 저장 실패:", error); }
        refreshFavoriteList();
        refreshChannelManager();
      }
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
    if (mediaTools.isRecording(uid)) { showNotice("녹화를 중지하고 결과를 확인한 뒤 방송을 삭제하세요."); return; }
    const tile = tileMap.get(uid);
    if (tile) {
      const iframe = tile.querySelector("iframe");
      if (iframe) iframe.src = "about:blank";
      tile.remove();
    }

    tileMap.delete(uid);
    clearSyncState(uid);
    state.channels = state.channels.filter(c => c.uid !== uid);

    if (state.selectedUid === uid) {
      state.selectedUid = state.channels[0]?.uid || null;
      if (state.selectedUid) {
        if (state.mainOnly) makeMainAudible();
      }
    }

    refreshChannelManager();
    syncSelection();
    applyLayout();
    updateChat();
    saveState();
  }

  const {isChannelVisibleInLayout, createTile, moveSelectedToFront, swapChannels, selectChannel, updateTileMainUI, syncSelection} = CZPlayers.create({get mediaTools() {return mediaTools;}, get state() {return state;}, get videoGrid() {return videoGrid;}, get dragUid() {return dragUid;}, set dragUid(value) {dragUid = value;}, tileMap, escapeHtml: (...args) => escapeHtml(...args), displayChannelName: (...args) => displayChannelName(...args), removeChannel: (...args) => removeChannel(...args), showNotice: (...args) => showNotice(...args), applyLayout: (...args) => applyLayout(...args), updateChat: (...args) => updateChat(...args), refreshChannelManager: (...args) => refreshChannelManager(...args), saveState: (...args) => saveState(...args), applyTileLock: (...args) => applyTileLock(...args), syncVolumeUI: (...args) => syncVolumeUI(...args), clearSyncState: (...args) => clearSyncState(...args), sendTileVolume: (...args) => sendTileVolume(...args), makeMainAudible: (...args) => makeMainAudible(...args)});

  const {clamp01, mainUid, effectiveVolume, isForcedMuted, effectiveMuted, sendTileVolume, sendAllTileVolumes, setTileVolume, toggleTileMute, setMasterVolume, toggleMasterMute, makeMainAudible, setMainOnly, receiveVideoState} = CZAudio.create({get state() { return state; }, tileMap, syncVolumeUI, saveStateSoon, saveState});

  // While a slider is being dragged, its DOM node must stay alive and keep its
  // own value; rebuilding it mid-drag is what used to break click-and-drag.
  function bindRangeDrag(input) {
    const start = () => { activeRange = input; };
    const end = () => { if (activeRange === input) activeRange = null; syncVolumeUI(); };
    input.addEventListener("pointerdown", start);
    input.addEventListener("change", end);
    input.addEventListener("pointerup", end);
    input.addEventListener("pointercancel", end);
    input.addEventListener("blur", end);
  }

  function buildVolumeList() {
    const list = ui?.querySelector("#tileVolumeList");
    if (!list) return null;

    const sig = state.channels.map(c => `${c.uid}\u0000${displayChannelName(c)}`).join("\n");
    if (sig === volumeListSig && (list.children.length > 0 || !state.channels.length)) return list;
    volumeListSig = sig;
    activeRange = null;

    if (!state.channels.length) {
      list.innerHTML = '<div class="volume-empty">방송을 추가하면 개별 볼륨을 조절할 수 있습니다.</div>';
      return list;
    }

    list.innerHTML = state.channels.map(c => `
      <div class="tile-volume-row" data-uid="${escapeHtml(c.uid)}">
        <div class="tile-volume-top">
          <button type="button" class="tile-mute-btn" title="음소거"></button>
          <span class="tile-volume-name">${escapeHtml(displayChannelName(c))}</span>
          <output></output>
        </div>
        <input type="range" min="0" max="100" step="1" value="100">
      </div>`).join("");

    list.querySelectorAll(".tile-volume-row").forEach(row => {
      const uid = row.dataset.uid;
      const input = row.querySelector("input");
      input.addEventListener("input", () => setTileVolume(uid, Number(input.value) / 100));
      bindRangeDrag(input);
      row.querySelector(".tile-mute-btn").addEventListener("click", e => {
        e.preventDefault();
        toggleTileMute(uid);
      });
    });
    return list;
  }

  // Updates existing controls in place (never recreates a slider that exists).
  function syncVolumeUI() {
    if (!ui) return;
    const master = ui.querySelector("#masterVolume");
    const masterValue = ui.querySelector("#masterVolumeValue");
    const mainCheck = ui.querySelector("#mainOnlyCheck");
    const masterPct = Math.round(clamp01(state.masterVolume ?? 1) * 100);
    const masterMuteBtn = ui.querySelector("#masterMuteBtn");

    if (master && activeRange !== master) master.value = String(masterPct);
    if (masterValue) masterValue.textContent = `${masterPct}%`;
    if (masterMuteBtn) {
      const muted = masterPct <= 0;
      masterMuteBtn.innerHTML = muted ? ICON_SPEAKER_MUTED : ICON_SPEAKER;
      masterMuteBtn.title = muted ? "전체 음소거 해제" : "전체 음소거";
      masterMuteBtn.classList.toggle("is-muted", muted);
    }
    if (mainCheck) mainCheck.checked = state.mainOnly === true;

    const list = buildVolumeList();
    if (!list) return;

    list.querySelectorAll(".tile-volume-row").forEach(row => {
      const channel = state.channels.find(c => c.uid === row.dataset.uid);
      if (!channel) return;
      const pct = Math.round(clamp01(channel.volume ?? 1) * 100);
      const input = row.querySelector("input");
      const output = row.querySelector("output");
      const muteBtn = row.querySelector(".tile-mute-btn");
      const ownMuted = channel.muted === true || pct <= 0;
      const forced = isForcedMuted(channel);

      if (input && activeRange !== input) input.value = String(pct);
      if (output) output.textContent = ownMuted ? "음소거" : `${pct}%`;
      if (muteBtn) {
        const html = ownMuted ? ICON_SPEAKER_MUTED : ICON_SPEAKER;
        if (muteBtn.dataset.state !== (ownMuted ? "m" : "u")) {
          muteBtn.innerHTML = html;
          muteBtn.dataset.state = ownMuted ? "m" : "u";
        }
        muteBtn.classList.toggle("is-muted", ownMuted);
        muteBtn.title = ownMuted ? "음소거 해제" : "음소거";
      }
      row.classList.toggle("is-forced", forced && !ownMuted);
      row.title = forced && !ownMuted
        ? (clamp01(state.masterVolume ?? 1) <= 0 ? "전체 볼륨이 0이라 소리가 나지 않습니다." : "메인만 듣기로 인해 음소거 중입니다.")
        : "";
    });
  }

  function refreshVolumeManager() {
    syncVolumeUI();
  }

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
      const collapsed=toolbarCollapsed;if(collapsed)toggleToolbar();
      const panel=ui.querySelector(key==='f'?'#favoriteManager':'#volumeManager');panel.open=collapsed || !panel.open;
      if(panel.open)ui.querySelector('#settingsManager').removeAttribute('open');
    }else if(key==='h')toggleScreenLock();
    else if(key==='b')toggleToolbar();
    else if(key==='c')toggleChat();
    else if(key==='g')ui.querySelector(`.layout-toggle-btn[data-layout="${state.layout==='grid'?'main-sub':'grid'}"]`).click();
  }
  const mediaTools = CZMediaTools.create({get shortcutsEnabled(){return state.shortcutsEnabled!==false;},onShortcut:handleShortcut,get state() {return state;}, get ui() {return ui;}, tileMap, showNotice, adjustSync, externalSeek});

  window.addEventListener("message", event => {
    const data = event.data;
    const fromChat=data?.type==='CHAT_READY' || data?.type==='MEDIA_KEY' && event.source===chatFrame?.contentWindow;
    const frame = fromChat ? chatFrame : tileMap.get(data?.uid)?.querySelector('iframe');
    if (!CZMessages.isPlayerMessage(event, frame) || fromChat && data.uid!==chatFrame?.dataset.uid) return;
    if (data.type === 'CHAT_READY') {
      if (data.uid !== chatFrame?.dataset.uid) return;
      frame.dataset.playerReady = 'true';
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

  function updateLayoutToggle() {
    if (!ui) return;
    ui.querySelectorAll(".layout-toggle-btn").forEach(button => {
      const active = button.dataset.layout === state.layout;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function applyLayout() {
    if (!videoGrid) return;

    videoGrid.classList.remove("layout-grid", "layout-2x2", "layout-3x3", "layout-main-sub");
    if (state.layout === "2x2" || state.layout === "3x3") state.layout = "grid";
    if (!["grid", "main-sub"].includes(state.layout)) state.layout = "grid";
    videoGrid.classList.add(`layout-${state.layout}`);

    // Keep the complete broadcast list in state, but only create player tiles
    // for broadcasts that are actually visible in the current layout. This
    // prevents hidden broadcasts from continuing to play audio.
    const displayMax = state.layout === "main-sub" ? 4 : 9;
    const visibleChannels = state.channels.slice(0, displayMax);
    const visibleUids = new Set(visibleChannels.map(c => c.uid));

    if (visibleChannels.length && !visibleUids.has(state.selectedUid)) {
      state.selectedUid = visibleChannels[0].uid;
    }

    // Remove tiles that are outside the visible range. Their iframe is
    // detached so it cannot continue playing audio in the background.
    for (const [uid, tile] of Array.from(tileMap.entries())) {
      if (visibleUids.has(uid)) continue;
      const iframe = tile.querySelector("iframe");
      if (iframe) iframe.src = "about:blank";
      const hiddenChannel = state.channels.find(c => c.uid === uid);
      if (hiddenChannel) hiddenChannel.muted = true;
      tile.remove();
      tileMap.delete(uid);
    }

    // Create tiles for the visible broadcasts only.
    for (const channel of visibleChannels) {
      createTile(channel);
    }

    // Update only CSS placement. Never append/move existing iframe nodes here:
    // DOM reparenting can cause CHZZK's player to reinitialize.
    visibleChannels.forEach((channel, index) => {
      const tile = tileMap.get(channel.uid);
      if (!tile) return;
      tile.style.display = "flex";
      tile.style.order = String(index);
      tile.style.gridColumn = "";
      tile.style.gridRow = "";
      tile.classList.toggle("main-tile", state.layout === "main-sub" && index === 0);
      tile.classList.remove("extra-main-sub");

      if (state.layout === "main-sub") {
        const mainOnLeft = state.chatSide === "left";
        if (index === 0) {
          tile.style.gridColumn = mainOnLeft ? "1" : "2";
          tile.style.gridRow = "1 / 4";
        } else {
          tile.style.gridColumn = mainOnLeft ? "2" : "1";
          tile.style.gridRow = String(index);
        }
      }

      sendTileVolume(channel.uid);
      applyTileLock(tile, state.screenLocked === true);
    });

    if (state.layout === "main-sub") {
      videoGrid.style.setProperty("--sub-count", String(Math.min(3, Math.max(1, visibleChannels.length - 1))));
    } else {
      videoGrid.style.removeProperty("--sub-count");
    }

    updateLayoutToggle();
    resizeFixedAspectGrid();
    refreshChannelManager();
    refreshVolumeManager();
  }

  function resizeFixedAspectGrid() {
    if (!videoGrid) return;
    const layout = state.layout;
    if (!["grid", "main-sub"].includes(layout)) return;

    requestAnimationFrame(() => {
      const rect = videoGrid.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const gap = 8;

      if (layout === "main-sub") {
        // Main is on the RIGHT; up to three 16:9 sub tiles are stacked on
        // the LEFT. The main tile uses the remaining horizontal space.
        const subH = Math.max(1, (rect.height - gap * 2) / 3);
        const subW = subH * 16 / 9;
        const mainW = Math.max(1, rect.width - gap - subW);

        if (state.chatSide === "left") {
          videoGrid.style.gridTemplateColumns = `${mainW}px ${subW}px`;
        } else {
          videoGrid.style.gridTemplateColumns = `${subW}px ${mainW}px`;
        }
        videoGrid.style.gridTemplateRows = `repeat(3, ${subH}px)`;
        videoGrid.style.justifyContent = "center";
        videoGrid.style.alignContent = "center";
        videoGrid.style.overflow = "hidden";
        return;
      }

      // Basic layout scales by the number of visible broadcasts:
      // 1 -> 1x1, 2 -> 2x1, 3~4 -> 2x2, 5~6 -> 3x2, 7~9 -> 3x3.
      // Only the first 9 broadcasts are displayed; the full list is retained.
      // Dimensions are recalculated from the CURRENT viewport/grid size so
      // moving a maximized browser between different monitors automatically
      // resizes the tiles to fit the new screen.
      const count = Math.min(state.channels.length, 9);
      let cols = 1;
      let rows = 1;
      if (count >= 7) {
        cols = 3;
        rows = 3;
      } else if (count >= 5) {
        cols = 3;
        rows = 2;
      } else if (count >= 3) {
        cols = 2;
        rows = 2;
      } else if (count === 2) {
        cols = 2;
        rows = 1;
      }
      const cellW = Math.max(1, (rect.width - gap * (cols - 1)) / cols);
      const cellH = Math.max(1, (rect.height - gap * (rows - 1)) / rows);
      const tileW = Math.min(cellW, cellH * 16 / 9);
      const tileH = tileW * 9 / 16;

      videoGrid.style.gridTemplateColumns = `repeat(${cols}, ${tileW}px)`;
      videoGrid.style.gridTemplateRows = `repeat(${rows}, ${tileH}px)`;
      videoGrid.style.justifyContent = "center";
      videoGrid.style.alignContent = "center";
      videoGrid.style.overflow = "hidden";
    });
  }

  const {updateChat} = CZChat.create({get state() {return state;}, get chatPanel() {return chatPanel;}, get chatFrame() {return chatFrame;}, set chatFrame(value) {chatFrame = value;}});

  function applyTileLock(tile, locked) {
    if (!tile) return;
    let shield = tile.querySelector(".tile-lock-shield");
    if (locked && !shield) {
      shield = document.createElement("div");
      shield.className = "tile-lock-shield";
      shield.title = "화면 잠금 상태";
      tile.querySelector(".tile-content")?.appendChild(shield);
    }
    if (shield) shield.style.display = locked ? "block" : "none";
    tile.classList.toggle("screen-locked", locked);
  }

  function setScreenLock(locked, persist = true) {
    state.screenLocked = !!locked;
    if (ui) {
      const buttons = [ui.querySelector("#screenLockBtn")].filter(Boolean);
      for (const btn of buttons) {
        btn.textContent = state.screenLocked ? "화면 잠금 해제" : "화면 잠금";
        btn.title = state.screenLocked ? "플레이어 조작 잠금 해제" : "플레이어 조작 잠금";
        btn.classList.toggle("lock-active", state.screenLocked);
      }
    }
    for (const tile of tileMap.values()) applyTileLock(tile, state.screenLocked);
    if (persist) saveState();
  }

  function toggleScreenLock() {
    setScreenLock(!state.screenLocked);
  }

  function toggleToolbar() {
    if (!ui) return;
    toolbarCollapsed = !toolbarCollapsed;
    ui.classList.toggle("toolbar-collapsed", toolbarCollapsed);
    updateToolbarToggleUI();
    requestAnimationFrame(() => resizeFixedAspectGrid());
  }

  function updateToolbarToggleUI() {
    if (!ui) return;
    const btn = ui.querySelector("#collapseBtn");
    if (!btn) return;
    btn.innerHTML = toolbarCollapsed ? ICON_CHEVRON_DOWN : ICON_CHEVRON_UP;
    btn.title = toolbarCollapsed ? "멀티뷰 메뉴 펼치기" : "멀티뷰 메뉴 접기";
    btn.setAttribute("aria-label", btn.title);
  }

  function setChatSide(side, persist = true) {
    state.chatSide = side === "left" ? "left" : "right";
    if (!ui) return;
    ui.classList.toggle("chat-left", state.chatSide === "left");
    const btn = ui.querySelector("#chatSideBtn");
    if (btn) {
      btn.innerHTML = chatSideIcon(state.chatSide);
      btn.title = state.chatSide === "left" ? "채팅창을 오른쪽으로 이동" : "채팅창을 왼쪽으로 이동";
      btn.setAttribute("aria-label", btn.title);
    }
    // Chat side changes both the outer panel position and the 1+3 / 3+1
    // raid arrangement. Re-apply the layout so gridColumn/gridRow follow it.
    applyLayout();
    if (persist) saveState();
  }

  function toggleChatSide() {
    setChatSide(state.chatSide === "left" ? "right" : "left");
  }

  function setChatOpen(open) {
    if (!ui) return;
    state.chatOpen = !!open;
    ui.classList.toggle("chat-closed", !state.chatOpen);
    const btn = ui.querySelector("#chatToggleBtn");
    if (btn) btn.textContent = state.chatOpen ? "채팅 닫기" : "채팅 열기";
    updateChat();
    requestAnimationFrame(() => resizeFixedAspectGrid());
    saveState();
  }

  function toggleChat() {
    setChatOpen(state.chatOpen === false);
  }

  function showNotice(message) {
    if (!ui) return;
    let notice = ui.querySelector(".mv-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "mv-notice";
      ui.appendChild(notice);
    }
    notice.textContent = message;
    notice.classList.remove("show");
    void notice.offsetWidth;
    notice.classList.add("show");
    clearTimeout(notice._hideTimer);
    notice._hideTimer = setTimeout(() => notice.classList.remove("show"), 1400);
  }

  function refreshChannelManager() {
    if (!ui) return;
    groupManager?.refreshActive();
    scheduleSyncRender();
    const list = ui.querySelector("#channelList");
    if (!list) return;
    list.innerHTML = state.channels.map((channel, index) => `
      <div class="channel-list-row" data-uid="${escapeHtml(channel.uid)}">
        <div class="channel-list-select">
          <span class="channel-list-index ${channel.uid === state.selectedUid ? 'is-main' : ''}" ${channel.uid === state.selectedUid ? 'aria-label="현재 메인 방송" title="현재 메인 방송"' : ''}>${index + 1}</span>
          <span class="channel-list-name">${escapeHtml(displayChannelName(channel))}</span>
        </div>
        <button class="channel-list-favorite" title="즐겨찾기 토글">${isFavorite(channel.uid) ? "★" : "☆"}</button>
        <button class="channel-list-remove" title="방송 삭제">✕</button>
      </div>`).join("");

    list.querySelectorAll(".channel-list-favorite").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const uid = btn.closest(".channel-list-row")?.dataset.uid;
        const channel = state.channels.find(c => c.uid === uid);
        if (!uid) return;
        toggleFavorite(uid, displayChannelName(channel) || uid);
        refreshChannelManager();
      });
    });
    list.querySelectorAll(".channel-list-remove").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const uid = btn.closest(".channel-list-row")?.dataset.uid;
        if (uid) removeChannel(uid);
      });
    });
  }

  const favoriteDuration = CZFavoritesStore.favoriteDuration;

  // The broadcast time keeps growing, so refresh it from the stored start time.
  function updateFavoriteMeta() {
    if (!ui) return;
    ui.querySelectorAll(".favorite-list-row").forEach(row => {
      const fav = favorites.find(f => f.uid === row.dataset.uid);
      const meta = row.querySelector(".favorite-list-meta");
      if (fav && meta) meta.textContent = favoriteDuration(fav);
    });
  }

  function favoriteItemsForGroup(group) {
    return CZFavoritesStore.itemsForGroup(favorites, group);
  }

  function refreshFavoriteList() {
    if (!ui) return;
    ensureFavoriteGroups();
    const list = ui.querySelector("#favoriteList");
    if (!list) return;

    list.innerHTML = favoriteGroups.map(group => {
      const allItems = favoriteItemsForGroup(group);
      const items = CZGroupManager.visibleItems(group, allItems);
      const online = items.filter(f=>f.online);
      return `<details class="favorite-list-group" open data-group="${escapeHtml(group)}">
        <summary class="favorite-list-group-summary">
          <span class="favorite-list-group-name">${escapeHtml(group)}</span>
          <span class="favorite-list-group-count">(${allItems.length})</span>
          ${online.length ? `<button class="favorite-group-open-online" type="button" data-group="${escapeHtml(group)}">온라인 ${online.length}개 멀티뷰</button>` : ''}
        </summary>
        <div class="favorite-list-group-items">
          ${items.map(f => `<div class="favorite-list-row ${f.online ? 'online' : 'offline'}" data-uid="${escapeHtml(f.uid)}">
            <span class="favorite-status-dot ${f.online ? 'online' : ''}"></span>
            <button class="favorite-list-add" title="방송 추가"><span class="favorite-list-text"><span class="favorite-list-identity"><span class="favorite-list-name" title="${escapeHtml(f.name || f.title || f.uid)}">${escapeHtml(f.name || f.title || f.uid)}</span><span class="favorite-list-category" title="${escapeHtml(f.online ? f.category || '-' : '-')}">${escapeHtml(f.online ? f.category || '-' : '-')}</span></span><span class="favorite-list-meta" title="방송 시간 (hh:mm:ss)">${escapeHtml(favoriteDuration(f))}</span><span class="favorite-list-viewers" title="현재 시청자 수"><svg class="viewer-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="4" r="3"/><path d="M2 15v-2a6 6 0 0 1 12 0v2z"/></svg><span class="favorite-list-viewer-count">${escapeHtml(CZFavoritesStore.favoriteViewerText(f))}</span></span></span><span class="favorite-online-badge ${f.online ? 'online':'offline'}">${f.online ? 'ONLINE':'OFFLINE'}</span></button>
          </div>`).join('') || '<div class="favorite-list-empty">표시할 방송이 없습니다.</div>'}
        </div>
      </details>`;
    }).join('');

    CZGroupManager.decorate(ui);
    groupManager?.refreshActive();

    list.querySelectorAll('.favorite-list-add').forEach(btn=>btn.addEventListener('click',e=>{
      e.stopPropagation(); const uid=btn.closest('.favorite-list-row')?.dataset.uid; if(!uid)return;
      const fav=favorites.find(f=>f.uid===uid); addToListFromFavorite(fav); ui.querySelector('#favoriteManager')?.removeAttribute('open');
    }));
    list.querySelectorAll('.favorite-group-open-online').forEach(btn=>btn.addEventListener('click',e=>{
      e.preventDefault(); e.stopPropagation();
      favoriteItemsForGroup(btn.dataset.group).filter(f=>f.online).forEach(f=>addToListFromFavorite(f));
    }));
  }

  function addToListFromFavorite(fav) {
    if (!fav) return;
    const exists = state.channels.some(c=>c.uid===fav.uid);
    if (!exists) addChannel(fav.uid, {type:"live", id:fav.uid, uid:fav.uid, url:`https://chzzk.naver.com/live/${encodeURIComponent(fav.uid)}`});
  }

  async function saveFavorites() {
    applyFavoriteSnapshot(CZFavoritesStore.snapshot(favorites, favoriteGroups));
    try {
      await CZFavoritesStore.write(favorites, favoriteGroups);
      return true;
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) throw error;
      showNotice("확장 연결이 끊겨 변경은 현재 화면에만 적용됩니다. 저장·다른 화면 동기화는 사용할 수 없습니다.");
      return false;
    }
  }

  const fetchFavoriteLive = CZChzzkApi.fetchFavoriteInfo;

  function isExtensionContextInvalidated(error) {
    return String(error?.message || error).includes("Extension context invalidated");
  }

  let favoriteRefreshInFlight = null;
  function refreshFavoriteOnlineStatus(...args) {
    if (favoriteRefreshInFlight) return favoriteRefreshInFlight;
    favoriteRefreshInFlight = performFavoriteOnlineRefresh(...args).finally(() => { favoriteRefreshInFlight = null; });
    return favoriteRefreshInFlight;
  }

  async function performFavoriteOnlineRefresh(notify = true, { persist = true } = {}) {
    if (!favorites.length) return;
    const uids = favorites.map(f => f.uid);
    const results = await CZChzzkApi.parallelMap(uids, uid => fetchFavoriteLive(uid, { throwOnError: true }));
    const updates = Object.fromEntries(uids.map((uid, i) => [uid, results[i]]));
    favorites = CZFavoritesStore.mergeInfo(favorites, updates);
    if (persist) {
      try {
        applyFavoriteSnapshot(await CZFavoritesStore.writeInfo(updates));
      } catch (error) {
        if (!isExtensionContextInvalidated(error)) throw error;
        // The context may also expire while the API requests are in flight.
        persist = false;
      }
    }
    refreshFavoriteList();
    if (notify) showNotice(persist
      ? "즐겨찾기 온라인 상태를 갱신했습니다."
      : "현재 화면의 온라인 상태를 갱신했습니다. 확장 연결이 끊겨 저장·다른 화면 동기화는 사용할 수 없습니다.");
  }

  function isFavorite(uid) { return favorites.some(f => f.uid === uid); }

  function toggleFavorite(uid, title = uid) {
    if (isFavorite(uid)) favorites = favorites.filter(f => f.uid !== uid);
    else { const nextOrder=favorites.reduce((max,f)=>Math.max(max,Number(f.order)||0),0)+1; favorites.push({ uid, name:title||uid, title:title||uid, group:DEFAULT_FAVORITE_GROUP, online:false, openAt:null, category:"", order:nextOrder }); }
    ensureFavoriteGroups();
    saveFavorites().catch(console.warn);
    refreshFavoriteList();
    refreshChannelManager();
  }

  function clearAll() {
    if(mediaTools.hasRecordings()){showNotice("녹화를 중지한 뒤 전체 삭제하세요.");return;}
    for (const tile of tileMap.values()) {
      const iframe = tile.querySelector("iframe");
      if (iframe) iframe.src = "about:blank";
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

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function openMultiView(initialInput = "", initialInputs = []) {
    if(mediaTools.hasRecordings() && initialInputs.length) throw Error("녹화를 중지한 뒤 방송 목록을 교체하세요.");
    await loadState();

    const hasPopupList = Array.isArray(initialInputs) && initialInputs.length > 0;
    const popupInputs = hasPopupList ? initialInputs : (initialInput ? [initialInput] : []);

    if (hasPopupList) {
      // When the popup has an explicit MultiView list, that list is the
      // requested session. Do not mix it with broadcasts restored from the
      // previous session.
      const nextChannels = [];
      for (const input of popupInputs) {
        const parsed = parseInput(input);
        const uid = parsed?.uid;
        if (!uid || nextChannels.some(c => c.uid === uid)) continue;
        const previous = state.channels.find(c => c.uid === uid);
        const favorite = favorites.find(f => f.uid === uid);
        const favoriteName = favorite?.name || favorite?.title || "";
        nextChannels.push({
          uid, type: parsed.type, sourceId: parsed.id, url: parsed.url,
          title: previous?.title || favoriteName || safeTitle(uid),
          linkTitle: previous?.linkTitle || favoriteName || safeTitle(uid),
          name: previous?.name || favoriteName || "",
          muted: previous?.muted ?? true,
          volume: previous?.volume ?? 1
        });
      }
      state.channels = nextChannels;
    } else if (initialInput) {
      // A direct input is treated as a new requested broadcast in addition to
      // the restored session only when it is explicitly supplied.
      const uid = uidFromInput(initialInput);
      if (uid && !state.channels.some(c => c.uid === uid)) {
        state.channels.push({ uid, title: safeTitle(uid), linkTitle: safeTitle(uid), name: "", muted: true, volume: 1 });
      }
    }

    // Only a fresh viewer launch resets audio; updating an open viewer keeps it.
    if (!initialized) state.channels.forEach(channel => {channel.volume = 0.1; channel.muted = true;});

    if (!state.channels.some(c => c.uid === state.selectedUid)) state.selectedUid = state.channels[0]?.uid || null;
    if (state.layout === "main-sub") moveSelectedToFront();
    // Drop only removed tiles; retain surviving iframe instances and audio state.
    for (const [uid, tile] of tileMap) {
      if (state.channels.some(c => c.uid === uid)) continue;
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

  let viewerTabId = null;
  let initialized = false;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return;

    if (message.type !== 'VIEWER_SET_INPUTS' || sender.id !== chrome.runtime.id || message.tabId !== viewerTabId) return;
    if (!initialized) { sendResponse({ok: false}); return; }
    openMultiView('', message.initialInputs || []).then(() => sendResponse({ok: true})).catch(error => sendResponse({ok: false, error: String(error)}));
    return true;

  });

  const boot = async () => {
    viewerTabId = globalThis.CZ_SITE_VIEWER ? (await chrome.runtime.sendMessage({type:'SITE_VIEWER_TAB'}))?.tabId : (await chrome.tabs.getCurrent())?.id;
    const query = new URL(location.href).searchParams;
    let inputs = [];
    if (!globalThis.CZ_SITE_VIEWER && query.has('inputs')) inputs = JSON.parse(query.get('inputs'));
    await chrome.runtime.sendMessage({type: 'COOKIE_BRIDGE_INIT'});
    await openMultiView('', Array.isArray(inputs) ? inputs : []);
    // Explicit launch inputs apply once; refreshing restores the saved session.
    if(!globalThis.CZ_SITE_VIEWER)history.replaceState(null, '', location.pathname);
    initialized = true;
    if(!globalThis.CZ_SITE_VIEWER)document.body.classList.add('ready');
  };
  boot().catch(error => {
    console.error(error);
    document.getElementById(ROOT_ID)?.remove();
    if(document.getElementById('startupStatus'))document.getElementById('startupStatus').textContent = '멀티뷰를 열지 못했습니다. 확장을 다시 로드한 뒤 페이지를 새로고침해주세요.';
  });
  window.addEventListener('pagehide', saveState);

  const scheduleGridResize = () => {
    requestAnimationFrame(() => resizeFixedAspectGrid());
  };

  const mvResizeObserver = new ResizeObserver(scheduleGridResize);
  // A maximized browser can change its CSS viewport when moved between
  // monitors with different resolutions/scaling. Recalculate immediately.
  window.addEventListener("resize", scheduleGridResize, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleGridResize, { passive: true });
  }


})();
