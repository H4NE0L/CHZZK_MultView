(() => {
  if (window.top !== window) return;
  if (window.__CHZZK_MULTIVIEW_PAGE_LOADED__) return;
  window.__CHZZK_MULTIVIEW_PAGE_LOADED__ = true;

  const ROOT_ID = "__chzzk_multiview_v09__";
  const STORAGE_KEY = "chzzkMultiviewV09";
  const DEFAULT_FAVORITE_GROUP = CZFavoritesStore.DEFAULT_GROUP;

  const DEFAULT_STATE = {
    channels: [],
    selectedUid: null,
    layout: "grid",
    chatOpen: true,
    screenLocked: false,
    mainOnly: false,
    masterVolume: 1,
    chatSide: "right"
  };

  let state = { ...DEFAULT_STATE };
  let shadowRoot = null;
  let ui = null;
  let videoGrid = null;
  let chatPanel = null;
  let chatFrame = null;
  let tileMap = new Map();
  let dragUid = null;
  let chatTimer = null;
  let opened = false;
  let toolbarCollapsed = false;
  let favorites = [];
  let favoriteGroups = [DEFAULT_FAVORITE_GROUP];
  let favDragUid = null;
  let favDragGroup = null;
  let saveTimer = null;
  let volumeListSig = "";
  let activeRange = null;
  const lastVolumeSent = new Map();

  const ICON_CHEVRON_UP = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  const ICON_CHEVRON_DOWN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const ICON_SPEAKER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_SPEAKER_MUTED = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function chatSideIcon(side) {
    const x = side === "left" ? 3 : 15;
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="${x}" y="4" width="6" height="16" rx="1" fill="currentColor" stroke="none"/></svg>`;
  }

  function parseInput(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    if (/^[A-Za-z0-9_-]{6,}$/.test(raw)) {
      return { type: "live", id: raw, uid: raw, url: `https://chzzk.naver.com/live/${encodeURIComponent(raw)}` };
    }

    // Allow shorthand replay input such as `video/12345678` in addition to
    // the full https://chzzk.naver.com/video/12345678 URL.
    const shorthandVideo = raw.match(/^\/?video\/([^/?#]+)$/i);
    if (shorthandVideo) {
      const id = shorthandVideo[1];
      return { type: "video", id, uid: `video:${id}`, url: `https://chzzk.naver.com/video/${encodeURIComponent(id)}` };
    }

    try {
      const url = new URL(raw);
      const live = url.pathname.match(/^\/live\/([^/?#]+)/);
      if (live) {
        return { type: "live", id: live[1], uid: live[1], url: `https://chzzk.naver.com/live/${encodeURIComponent(live[1])}` };
      }
      const video = url.pathname.match(/^\/video\/([^/?#]+)/);
      if (video) {
        return { type: "video", id: video[1], uid: `video:${video[1]}`, url: `https://chzzk.naver.com/video/${encodeURIComponent(video[1])}` };
      }
    } catch (_) {}
    return null;
  }

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

  function extractStreamerName(title, uid) {
    let t = String(title || "").trim();
    if (!t) return uid;
    // Page title format: "채널명 - 방송 제목 - CHZZK".  The API result is
    // preferred, so this is only a DOM/title fallback.
    t = t.replace(/\s*[-|]\s*(치지직|CHZZK).*$/i, "").trim();
    const parts = t.split(/\s+-\s+/).map(v => v.trim()).filter(Boolean);
    if (parts.length >= 2) return parts[0];
    return t !== uid ? t : uid;
  }

function saveState() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  try {
    // 확장 프로그램 컨텍스트가 유효하지 않으면 저장을 시도하지 않는다.
    if (!chrome?.runtime?.id || !chrome?.storage?.local) return;

    chrome.storage.local.set({
      [STORAGE_KEY]: {
        channels: state.channels.map(({ _mainOnlyMuted, ...channel }) => channel),
        selectedUid: state.selectedUid,
        layout: state.layout,
        chatOpen: state.chatOpen !== false,
        chatSide: state.chatSide === "left" ? "left" : "right",
        screenLocked: state.screenLocked === true,
        mainOnly: state.mainOnly === true,
        masterVolume: clamp01(state.masterVolume ?? 1)
      }
    }).catch(error => {
      const message = String(error?.message || error);

      // 확장 프로그램이 다시 로드된 경우 발생할 수 있는 오류
      if (message.includes("Extension context invalidated")) return;

      console.warn("멀티뷰 상태 저장 실패:", error);
    });
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

    const result = await chrome.storage.local.get(STORAGE_KEY);
    const saved = result[STORAGE_KEY];

    if (!saved) return;

    state = {
      ...DEFAULT_STATE,
      ...saved,
      channels: Array.isArray(saved.channels) ? saved.channels : [],
      chatOpen: saved.chatOpen !== false,
      screenLocked: saved.screenLocked === true,
      mainOnly: saved.mainOnly === true,
      chatSide: saved.chatSide === "left" ? "left" : "right",
      masterVolume: Number.isFinite(Number(saved.masterVolume)) ? clamp01(saved.masterVolume) : 1
    };

    // v0.12.1 unifies the former 2x2/3x3 modes into one Basic layout.
    if (state.layout === "2x2" || state.layout === "3x3" || !["grid", "main-sub"].includes(state.layout)) {
      state.layout = "grid";
    }

    state.channels = state.channels.map(c => {
      const { streamInfo, ...clean } = c || {};
      return { ...clean, volume: Number.isFinite(Number(clean.volume)) ? Math.max(0, Math.min(1, Number(clean.volume))) : 1, name: clean.name || "" };
    });
    if (!state.selectedUid && state.channels[0]) {
      state.selectedUid = state.channels[0].uid;
    }
  }

  function createUI() {
    if (document.getElementById(ROOT_ID)) {
      const existing = document.getElementById(ROOT_ID);
      existing.style.display = "block";
      opened = true;
      return;
    }

    const host = document.createElement("div");
    host.id = ROOT_ID;
    document.documentElement.appendChild(host);
    shadowRoot = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = CSS;
    shadowRoot.appendChild(style);

    ui = document.createElement("div");
    ui.className = "mv-root";
    ui.innerHTML = `
      <header class="mv-toolbar">
        <div class="toolbar-left">
          <details id="favoriteManager" class="favorite-manager">
            <summary>즐겨찾기</summary>
            <div class="favorite-manager-panel">
              <div class="favorite-manager-tools">
                <button id="favoriteManageGroups" type="button">그룹 관리</button>
                <button id="favoriteManageItems" type="button">항목 관리</button>
                <button id="favoriteRefresh" type="button" title="온라인 상태 새로고침">↻</button>
              </div>
              <div id="favoriteList" class="favorite-list"></div>
              <div id="favoriteGroupModal" class="favorite-modal"><div class="favorite-dialog"><div class="favorite-dialog-head"><strong>그룹 관리</strong><button type="button" data-fav-close="groups">✕</button></div><button id="favoriteModalAddGroup" type="button" class="favorite-modal-add">+ 그룹 추가</button><div id="favoriteGroupManageList" class="favorite-manage-list"></div></div></div>
              <div id="favoriteItemModal" class="favorite-modal"><div class="favorite-dialog"><div class="favorite-dialog-head"><strong>항목 관리</strong><button type="button" data-fav-close="items">✕</button></div><p class="favorite-modal-help">전체 즐겨찾기의 순서입니다. 그룹을 변경해도 전체 순번은 유지됩니다.</p><div id="favoriteItemManageList" class="favorite-manage-list"></div></div></div>
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
            <button type="button" class="layout-toggle-btn" data-layout="grid">기본</button>
            <button type="button" class="layout-toggle-btn" data-layout="main-sub">레이드 뷰</button>
          </div>
          <button id="chatSideBtn" class="icon-btn" type="button"></button>
          <button id="chatToggleBtn" title="채팅 닫기/열기">채팅 닫기</button>
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
            <strong>채팅</strong>
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

    videoGrid = ui.querySelector("#videoGrid");
    chatPanel = ui.querySelector("#chatPanel");

    ui.querySelector("#addBtn").addEventListener("click", addFromInput);
    ui.querySelector("#clearBtn").addEventListener("click", clearAll);
    ui.querySelector("#favoriteManageGroups").addEventListener("click", () => showFavoriteModal("groups"));
    ui.querySelector("#favoriteManageItems").addEventListener("click", () => showFavoriteModal("items"));
    
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
          if (ui.querySelector("#favoriteGroupModal")?.classList.contains("open") && !favDragGroup) renderFavoriteGroupManager();
          if (ui.querySelector("#favoriteItemModal")?.classList.contains("open") && !favDragUid) renderFavoriteItemManager();
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
    
    ui.querySelector("#favoriteModalAddGroup").addEventListener("click", async () => {
      const name = window.prompt("새 그룹 이름을 입력하세요.", "새 그룹");
      if (name === null) return;
      const group = name.trim();
      if (!group || favoriteGroups.includes(group)) return;
      applyFavoriteSnapshot(CZFavoritesStore.addGroup(favorites, favoriteGroups, group));
      await saveFavorites();
      renderFavoriteGroupManager();
      refreshFavoriteList();
    });
    ui.querySelectorAll("[data-fav-close]").forEach(btn => btn.addEventListener("click", () => closeFavoriteModal(btn.dataset.favClose)));
    ui.querySelector("#collapseBtn").addEventListener("click", toggleToolbar);
    ui.querySelector("#chatToggleBtn").addEventListener("click", toggleChat);
    ui.querySelector("#chatSideBtn").addEventListener("click", toggleChatSide);
    ui.querySelector("#screenLockBtn").addEventListener("click", toggleScreenLock);

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
    opened = true;
    showPageLauncher(false);
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
    if (channel.type !== "live") {
      saveState();
      return;
    }

    resolveChannelName(channel);
  }

  function resolveChannelName(channel) {
    if (channel.type === "video") return;
    const uid = channel.uid;
    fetchChannelName(channel.sourceId || uid).then(async name => {
      if (!name) return;
      const current = state.channels.find(c => c.uid === uid);
      if (!current) return;
      current.name = name;
      current.title = name;
      const tile = tileMap.get(uid);
      const nameEl = tile?.querySelector(".tile-streamer-name");
      if (nameEl) nameEl.textContent = name;
      const fav = favorites.find(f => f.uid === uid);
      if (fav) {
        fav.name = name;
        fav.title = name;
        try {
          applyFavoriteSnapshot(await CZFavoritesStore.writeInfo({[uid]: {name, title: name}}));
        } catch (error) { console.warn("방송 이름 저장 실패:", error); }
        refreshFavoriteList();
        refreshChannelManager();
      }
      refreshChannelManager();
      syncVolumeUI();
      saveState();
    });
  }

  function removeChannel(uid) {
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
        const selected = state.channels.find(c => c.uid === state.selectedUid);
        if (selected) selected.muted = false;
      }
    }

    refreshChannelManager();
    syncSelection();
    applyLayout();
    updateChat();
    saveState();
  }

  function isChannelVisibleInLayout(uid) {
    const index = state.channels.findIndex(c => c.uid === uid);
    if (index < 0) return false;
    const displayMax = state.layout === "main-sub" ? 4 : 9;
    return index < displayMax;
  }

  function createTile(channel) {
    if (tileMap.has(channel.uid)) return;

    const tile = document.createElement("article");
    tile.className = "video-tile";
    tile.dataset.uid = channel.uid;

    tile.innerHTML = `
      <div class="tile-head" draggable="true">
        <span class="drag-handle" title="드래그해서 위치 변경">⠿</span>
        <span class="tile-streamer-name">${escapeHtml(displayChannelName(channel))}</span>
        <button class="main-btn" type="button" title="이 방송을 메인 방송으로 변경">메인으로 변경</button>
        <span class="tile-head-spacer"></span>
        <button class="tile-address" title="방송 링크 생성">링크 생성</button>
        <button class="tile-btn remove-btn" title="삭제">✕</button>
      </div>
      <div class="tile-content">
        <iframe
          src="${escapeHtml(channel.url || `https://chzzk.naver.com/live/${encodeURIComponent(channel.uid)}`)}"
          allow="autoplay; fullscreen"
          loading="eager"
          scrolling="no"
          frameborder="0"
          referrerpolicy="strict-origin-when-cross-origin">
        </iframe>
      </div>
    `;

    const removeBtn = tile.querySelector(".remove-btn");
    const header = tile.querySelector(".tile-head");


    removeBtn.addEventListener("click", e => {
      e.stopPropagation();
      removeChannel(channel.uid);
    });

    // Main broadcast changes ONLY through this button. Clicking a tile or the
    // player inside it never changes the main broadcast.
    tile.querySelector(".main-btn").addEventListener("click", e => {
      e.stopPropagation();
      if (channel.uid === state.selectedUid) return;
      selectChannel(channel.uid);
    });

    tile.addEventListener("mouseenter", () => {
      const iframe = tile.querySelector("iframe");
      try { iframe?.contentWindow?.postMessage({ source: "chzzk-multiview", type: "SET_NAV_VISIBLE", visible: true }, "https://chzzk.naver.com"); } catch (_) {}
    });
    tile.addEventListener("mouseleave", () => {
      const iframe = tile.querySelector("iframe");
      try { iframe?.contentWindow?.postMessage({ source: "chzzk-multiview", type: "SET_NAV_VISIBLE", visible: false }, "https://chzzk.naver.com"); } catch (_) {}
    });

    header.addEventListener("dragstart", e => {
      dragUid = channel.uid;
      tile.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", channel.uid);
    });

    header.addEventListener("dragend", () => {
      dragUid = null;
      tile.classList.remove("dragging");
      videoGrid.querySelectorAll(".drop-target").forEach(el => {
        el.classList.remove("drop-target");
      });
    });

    const addressBtn = tile.querySelector(".tile-address");
    addressBtn.addEventListener("click", async e => {
      e.stopPropagation();
      const url = channel.url || `https://chzzk.naver.com/live/${encodeURIComponent(channel.uid)}`;
      const current = state.channels.find(c => c.uid === channel.uid) || channel;
      const streamerName = String(current.name || "").trim() || String(current.linkTitle || "").replace(/\s*-\s*CHZZK\s*$/i, "").trim() || String(current.title || "").replace(/\s*-\s*CHZZK\s*$/i, "").trim() || `CHZZK ${channel.uid}`;
      const linkTitle = `${streamerName} - CHZZK`;
      const html = `<a href="${escapeHtml(url)}">${escapeHtml(linkTitle)}</a>`;

      try {
        if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
          const item = new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([url], { type: "text/plain" })
          });
          await navigator.clipboard.write([item]);
        } else {
          throw new Error("Rich clipboard API unavailable");
        }

        addressBtn.textContent = "링크 복사됨";
        showNotice("방송 링크 복사됨");
        setTimeout(() => { if (addressBtn.isConnected) addressBtn.textContent = "링크 생성"; }, 900);
      } catch (_) {
        try {
          // Fallback: copy a real anchor element through the browser's rich-text clipboard path.
          const wrapper = document.createElement("div");
          wrapper.contentEditable = "true";
          wrapper.style.position = "fixed";
          wrapper.style.left = "-9999px";
          wrapper.innerHTML = html;
          document.body.appendChild(wrapper);

          const range = document.createRange();
          range.selectNodeContents(wrapper);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          document.execCommand("copy");
          selection.removeAllRanges();
          wrapper.remove();

          addressBtn.textContent = "링크 복사됨";
          showNotice("방송 링크 복사됨");
          setTimeout(() => { if (addressBtn.isConnected) addressBtn.textContent = "링크 생성"; }, 900);
        } catch (_) {}
      }
    });

    const tileFrame = tile.querySelector("iframe");
    tileFrame?.addEventListener("load", () => {
      // A freshly loaded player starts at its own default position.
      clearSyncState(channel.uid);
      try {
        tileFrame.contentWindow.postMessage({
          source: "chzzk-multiview", type: "ENTER_THEATER"
        }, "https://chzzk.naver.com");
        tileFrame.contentWindow.postMessage({
          source: "chzzk-multiview", type: "SET_CHAT_VISIBLE", visible: false
        }, "https://chzzk.naver.com");
      } catch (_) {}
      // New/recreated tiles start muted by default. Saved mute state, the
      // per-tile volume and the master volume are combined here.
      sendTileVolume(channel.uid);
    });

    tile.addEventListener("dragover", e => {
      if (!dragUid || dragUid === channel.uid) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      videoGrid.querySelectorAll(".drop-target").forEach(el => {
        el.classList.remove("drop-target");
      });
      tile.classList.add("drop-target");
    });

    tile.addEventListener("dragleave", () => {
      tile.classList.remove("drop-target");
    });

    tile.addEventListener("drop", e => {
      e.preventDefault();
      tile.classList.remove("drop-target");

      const fromUid = e.dataTransfer.getData("text/plain") || dragUid;
      const toUid = channel.uid;

      if (!fromUid || fromUid === toUid) return;
      swapChannels(fromUid, toUid);
    });

    tileMap.set(channel.uid, tile);
    videoGrid.appendChild(tile);

    updateTileMainUI(channel.uid);
    sendTileVolume(channel.uid);
    applyTileLock(tile, state.screenLocked === true);

    // Do not touch iframe.src after creation.
    // This is the key to preserving the live player while changing layout/order.
  }

  // Used when switching to the raid view: the current main broadcast moves to
  // the front without touching the iframes.
  function moveSelectedToFront() {
    const index = state.channels.findIndex(c => c.uid === state.selectedUid);
    if (index > 0) {
      state.channels = [state.channels[index], ...state.channels.slice(0, index), ...state.channels.slice(index + 1)];
    }
  }

  function swapChannels(fromUid, toUid) {
    const fromIndex = state.channels.findIndex(c => c.uid === fromUid);
    const toIndex = state.channels.findIndex(c => c.uid === toUid);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    [state.channels[fromIndex], state.channels[toIndex]] =
      [state.channels[toIndex], state.channels[fromIndex]];

    // Do not move or recreate iframe DOM nodes. CSS grid positioning is updated
    // from the saved channel order instead.
    applyLayout();
    syncSelection();
    saveState();
  }

  function selectChannel(uid) {
    if (!state.channels.some(c => c.uid === uid)) return;

    state.selectedUid = uid;

    // In raid view, the selected/main broadcast is always the large tile.
    // Reorder the saved channel list so the large slot follows the selected
    // broadcast without recreating the existing iframe elements.
    if (state.layout === "main-sub") moveSelectedToFront();

    if (state.mainOnly) makeMainAudible();

    syncSelection();
    applyLayout();
    updateChat();
    refreshChannelManager();
    saveState();
  }

  // Highlight + "메인으로 변경 / 현재 메인" state of one tile.
  function updateTileMainUI(uid) {
    const tile = tileMap.get(uid);
    if (!tile) return;
    const selected = uid === state.selectedUid;
    tile.classList.toggle("selected", selected);
    tile.classList.toggle("tile-hover-controls", selected);
    const mainBtn = tile.querySelector(".main-btn");
    if (mainBtn) {
      mainBtn.textContent = selected ? "현재 메인" : "메인으로 변경";
      mainBtn.disabled = selected;
      mainBtn.classList.toggle("is-main", selected);
    }
  }

  function syncSelection() {
    for (const channel of state.channels) {
      const tile = tileMap.get(channel.uid);
      if (!tile) continue;

      updateTileMainUI(channel.uid);
      sendTileVolume(channel.uid);
      const iframe = tile.querySelector("iframe");
      try {
        iframe?.contentWindow?.postMessage({
          source: "chzzk-multiview",
          type: "SET_NAV_VISIBLE",
          visible: false
        }, "https://chzzk.naver.com");
        iframe?.contentWindow?.postMessage({
          source: "chzzk-multiview",
          type: "SET_CHAT_VISIBLE",
          visible: false
        }, "https://chzzk.naver.com");
      } catch (_) {}
    }
    syncVolumeUI();
  }

  /* ------------------------------------------------------------------
     Volume model
       channel.volume  : each broadcast's own volume (0..1)
       channel.muted   : each broadcast's own mute switch
       state.masterVolume : the extension's overall volume (0..1)

     What a player actually receives is channel.volume * masterVolume.
     The master volume never rewrites channel.volume, so moving it does not
     disturb the individual settings. "Main only" is applied on top as a
     temporary forced mute for every non-main broadcast.
  ------------------------------------------------------------------ */

  function clamp01(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  }

  function mainUid() {
    if (state.selectedUid && state.channels.some(c => c.uid === state.selectedUid)) return state.selectedUid;
    return state.channels[0]?.uid || null;
  }

  function effectiveVolume(channel) {
    return clamp01(channel.volume ?? 1) * clamp01(state.masterVolume ?? 1);
  }

  function isForcedMuted(channel) {
    return clamp01(state.masterVolume ?? 1) <= 0 || (state.mainOnly === true && channel.uid !== mainUid());
  }

  function effectiveMuted(channel) {
    return channel.muted === true || clamp01(channel.volume ?? 1) <= 0 || isForcedMuted(channel);
  }

  function sendTileVolume(uid) {
    const channel = state.channels.find(c => c.uid === uid);
    const iframe = tileMap.get(uid)?.querySelector("iframe");
    if (!channel || !iframe) return;
    lastVolumeSent.set(uid, Date.now());
    try {
      iframe.contentWindow.postMessage({
        source: "chzzk-multiview",
        type: "SET_VOLUME",
        volume: effectiveVolume(channel),
        muted: effectiveMuted(channel)
      }, "https://chzzk.naver.com");
    } catch (_) {}
  }

  function sendAllTileVolumes() {
    for (const uid of tileMap.keys()) sendTileVolume(uid);
  }

  function setTileVolume(uid, volume) {
    const channel = state.channels.find(c => c.uid === uid);
    if (!channel) return;
    channel.volume = clamp01(volume);
    channel.muted = channel.volume <= 0;
    sendTileVolume(uid);
    syncVolumeUI();
    saveStateSoon();
  }

  function toggleTileMute(uid) {
    const channel = state.channels.find(c => c.uid === uid);
    if (!channel) return;
    const silent = channel.muted === true || clamp01(channel.volume ?? 1) <= 0;
    if (silent) {
      channel.muted = false;
      if (clamp01(channel.volume ?? 1) <= 0) channel.volume = 0.5;
    } else {
      channel.muted = true;
    }
    sendTileVolume(uid);
    syncVolumeUI();
    saveStateSoon();
  }

  function setMasterVolume(value) {
    state.masterVolume = clamp01(value);
    sendAllTileVolumes();
    syncVolumeUI();
    saveStateSoon();
  }

  function toggleMasterMute() {
    const current = clamp01(state.masterVolume ?? 1);
    if (current <= 0) {
      state.masterVolume = clamp01(state._previousMasterVolume ?? 1);
      if (state.masterVolume <= 0) state.masterVolume = 1;
    } else {
      state._previousMasterVolume = current;
      state.masterVolume = 0;
    }
    sendAllTileVolumes();
    syncVolumeUI();
    saveStateSoon();
  }

  function makeMainAudible() {
    const main = state.channels.find(c => c.uid === mainUid());
    if (!main) return;
    main.muted = false;
    if (clamp01(main.volume ?? 1) <= 0) main.volume = 0.5;
  }

  function setMainOnly(on) {
    state.mainOnly = !!on;
    if (state.mainOnly) makeMainAudible();
    sendAllTileVolumes();
    syncVolumeUI();
    saveState();
  }

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
  const syncOffsets = new Map();   // uid -> applied adjustment (ms)
  const syncDelays = new Map();    // uid -> { delay, canSeek, t }
  const syncPending = new Map();   // requestId -> { uid, reset }
  const SYNC_STATE_STALE_MS = 5000;
  let syncRequestSeq = 0;
  let syncSig = "";
  let syncFrame = 0;

  function formatSyncSeconds(ms) {
    if (!ms) return "0초";
    const seconds = Number((Math.abs(ms) / 1000).toFixed(2));
    return `${ms < 0 ? "-" : "+"}${seconds}초`;
  }

  function syncState(channel) {
    if (channel.type === "video") return { supported: false, note: "다시보기는 싱크 조정을 지원하지 않습니다." };
    if (!tileMap.has(channel.uid)) return { supported: false, note: "화면에 표시 중인 방송이 아닙니다." };
    return { supported: true, note: "" };
  }

  function requestSync(uid, deltaSeconds, reset = false) {
    const iframe = tileMap.get(uid)?.querySelector("iframe");
    if (!iframe?.contentWindow) return;
    const requestId = ++syncRequestSeq;
    syncPending.set(requestId, { uid, reset });
    setTimeout(() => {
      if (syncPending.delete(requestId)) showNotice("싱크 조정 응답이 없습니다. 방송이 아직 로딩 중일 수 있습니다.");
    }, 2500);
    try {
      iframe.contentWindow.postMessage({
        source: "chzzk-multiview", type: "SYNC_SEEK", requestId, delta: deltaSeconds
      }, "https://chzzk.naver.com");
    } catch (_) {
      syncPending.delete(requestId);
    }
  }

  function adjustSync(uid, deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return;
    requestSync(uid, deltaSeconds, false);
  }

  function resetSync(uid) {
    const offset = syncOffsets.get(uid) || 0;
    if (!offset) return;
    requestSync(uid, -offset / 1000, true);
  }

  function resetAllSync() {
    for (const [uid, offset] of [...syncOffsets]) {
      if (offset) resetSync(uid);
    }
  }

  function clearSyncState(uid) {
    syncOffsets.delete(uid);
    syncDelays.delete(uid);
    scheduleSyncRender();
  }

  function handleSyncResult(data) {
    const pending = syncPending.get(data.requestId);
    if (!pending || pending.uid !== data.uid) return;
    syncPending.delete(data.requestId);

    if (data.ok !== true) {
      showNotice(data.reason === "not-seekable"
        ? "이 방송은 아직 싱크를 조정할 수 없습니다. 재생이 시작된 뒤 다시 시도하세요."
        : "싱크를 조정하지 못했습니다.");
      return;
    }

    const applied = Math.round((Number(data.applied) || 0) * 1000);
    let next = (syncOffsets.get(data.uid) || 0) + applied;
    if (Math.abs(next) < 10) next = 0;
    if (next === 0) syncOffsets.delete(data.uid); else syncOffsets.set(data.uid, next);

    if (typeof data.delay === "number" && Number.isFinite(data.delay)) {
      syncDelays.set(data.uid, { delay: data.delay, canSeek: true, t: Date.now() });
    }

    if (data.clamped) {
      const forward = Number(data.requested) > 0;
      showNotice(applied === 0
        ? (forward ? "더 이상 앞으로 당길 수 없습니다. (라이브에 가장 가깝습니다)" : "더 이상 뒤로 돌릴 수 없습니다.")
        : "한계에 도달하여 일부만 적용되었습니다.");
    }
    scheduleSyncRender();
  }

  function handleSyncState(data) {
    const num = typeof data.delay === "number" && Number.isFinite(data.delay) ? data.delay : null;
    syncDelays.set(data.uid, { delay: num, canSeek: data.canSeek === true, t: Date.now() });
    if (ui?.querySelector("#syncManager")?.open) scheduleSyncRender();
  }

  function scheduleSyncRender() {
    if (syncFrame || !ui) return;
    syncFrame = requestAnimationFrame(() => {
      syncFrame = 0;
      renderSyncUI();
    });
  }

  function renderSyncUI() {
    if (!ui) return;

    // Always keep the toolbar badge and the top summary up to date.
    const adjusted = state.channels.filter(c => syncOffsets.get(c.uid));
    const badge = ui.querySelector("#syncBadge");
    if (badge) {
      badge.hidden = adjusted.length === 0;
      badge.textContent = String(adjusted.length);
      badge.title = `싱크 조정된 방송 ${adjusted.length}개`;
    }
    const resetAll = ui.querySelector("#syncResetAll");
    if (resetAll) resetAll.disabled = adjusted.length === 0;

    const summary = ui.querySelector("#syncSummaryList");
    if (summary) {
      summary.innerHTML = adjusted.length
        ? adjusted.map(c => `<span class="sync-chip"><b>${escapeHtml(displayChannelName(c))}</b>${formatSyncSeconds(syncOffsets.get(c.uid))}</span>`).join("")
        : '<span class="sync-summary-empty">싱크를 조정한 방송이 없습니다.</span>';
    }

    const panel = ui.querySelector("#syncManager");
    const list = ui.querySelector("#syncList");
    if (!panel?.open || !list) return;

    const sig = state.channels.map(c => `${c.uid}\u0000${displayChannelName(c)}\u0000${c.uid === state.selectedUid ? 1 : 0}\u0000${syncState(c).supported ? 1 : 0}`).join("\n");
    if (sig !== syncSig) {
      syncSig = sig;
      list.innerHTML = state.channels.length ? state.channels.map(c => {
        const info = syncState(c);
        const dis = info.supported ? "" : " disabled";
        return `
        <div class="sync-row${c.uid === state.selectedUid ? " is-main" : ""}" data-uid="${escapeHtml(c.uid)}">
          <div class="sync-row-top">
            <span class="sync-name">${escapeHtml(displayChannelName(c))}${c.uid === state.selectedUid ? ' <em class="channel-list-main">메인</em>' : ""}</span>
            <span class="sync-values"><span>싱크 <i data-k="offset">0초</i></span><span>지연 <i data-k="delay">-</i></span></span>
          </div>
          ${info.supported ? "" : `<div class="sync-note">${info.note}</div>`}
          <div class="sync-btns">
            <button type="button" data-step="-0.5" title="0.5초 뒤로 당기기"${dis}>-0.5</button>
            <button type="button" data-step="-0.1" title="0.1초 뒤로 당기기"${dis}>-0.1</button>
            <button type="button" data-step="0.1" title="0.1초 앞으로 밀기"${dis}>+0.1</button>
            <button type="button" data-step="0.5" title="0.5초 앞으로 밀기"${dis}>+0.5</button>
            <button type="button" data-reset title="이 방송의 싱크 조정을 초기화"${dis}>초기화</button>
          </div>
        </div>`;
      }).join("") : '<div class="volume-empty">방송을 추가하면 싱크를 조정할 수 있습니다.</div>';
    }

    list.querySelectorAll(".sync-row").forEach(row => {
      const uid = row.dataset.uid;
      const offset = syncOffsets.get(uid) || 0;
      const stat = syncDelays.get(uid);
      const fresh = stat && Date.now() - stat.t <= SYNC_STATE_STALE_MS && Number.isFinite(stat.delay);

      const offsetEl = row.querySelector('[data-k="offset"]');
      const delayEl = row.querySelector('[data-k="delay"]');
      const offsetText = formatSyncSeconds(offset);
      const delayText = fresh ? `${stat.delay.toFixed(1)}초` : "-";
      if (offsetEl.textContent !== offsetText) offsetEl.textContent = offsetText;
      offsetEl.classList.toggle("is-adjusted", offset !== 0);
      if (delayEl.textContent !== delayText) delayEl.textContent = delayText;

      const resetBtn = row.querySelector("[data-reset]");
      if (resetBtn && !row.querySelector(".sync-note")) resetBtn.disabled = offset === 0;
    });
  }

  window.addEventListener("message", event => {
    if (event.origin !== "https://chzzk.naver.com") return;
    const data = event.data;
    if (!data || data.source !== "chzzk-multiview" || !data.uid) return;
    if (!tileMap.has(data.uid)) return;
    if (data.type === "SYNC_STATE") handleSyncState(data);
    else if (data.type === "SYNC_RESULT") handleSyncResult(data);
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

  function updateChat() {
    const uid = state.selectedUid;

    if (!uid) {
      chatPanel.querySelector(".chat-frame-wrap").innerHTML = `
        <div id="chatEmpty" class="chat-empty">
          메인 방송을 선택하면<br>실제 CHZZK 채팅을 불러옵니다.
        </div>`;
      chatFrame = null;
      return;
    }


    const wrap = chatPanel.querySelector(".chat-frame-wrap");

    if (!chatFrame) {
      chatFrame = document.createElement("iframe");
      chatFrame.className = "chat-frame";
      chatFrame.allow = "autoplay";
      chatFrame.referrerPolicy = "strict-origin-when-cross-origin";
      wrap.innerHTML = "";
      wrap.appendChild(chatFrame);
      chatFrame.addEventListener("load", () => {
        try {
          chatFrame.contentWindow.postMessage({
            source: "chzzk-multiview", type: "SET_CHAT_MODE", visible: true
          }, "https://chzzk.naver.com");
        } catch (_) {}
      });
    }

    const channel = state.channels.find(c => c.uid === uid);
    const target = channel?.type === "video"
      ? `${channel.url}${channel.url.includes("?") ? "&" : "?"}multiview=chat`
      : `https://chzzk.naver.com/live/${encodeURIComponent(channel?.sourceId || uid)}/chat?multiview=1`;

    // Only reload chat when the selected channel changes.
    if (chatFrame.dataset.uid !== uid) {
      chatFrame.dataset.uid = uid;
      chatFrame.src = target;
      waitForChatDom(chatFrame, uid, channel?.type === "video");
    }
  }

  function waitForChatDom(frame, uid, isReplay = false) {
    if (chatTimer) {
      clearInterval(chatTimer);
      chatTimer = null;
    }

    let tries = 0;

    const timer = setInterval(() => {
      tries++;

      if (frame.dataset.uid !== uid) {
        clearInterval(timer);
        return;
      }

      try {
        const doc = frame.contentDocument;
        if (!doc) return;

        // Replay pages contain both the replay chat and the normal comment
        // area. Prefer the section explicitly labelled "라이브 채팅 다시보기"
        // so the generic chat/comment detector cannot select the wrong panel.
        const chatRoot = isReplay ? (findReplayChatRoot(doc) || findChatRoot(doc)) : findChatRoot(doc);

        if (chatRoot) {
          prepareChatOnlyFrame(doc, chatRoot);
          clearInterval(timer);
          chatTimer = null;
              return;
        }
      } catch (_) {}

      if (tries > 80) {
        clearInterval(timer);
        chatTimer = null;
        }
    }, 250);

    chatTimer = timer;
  }

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
    if (!state.chatOpen) {
      if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
    } else if (state.selectedUid) {
      updateChat();
    }
    requestAnimationFrame(() => resizeFixedAspectGrid());
    saveState();
  }

  function toggleChat() {
    setChatOpen(state.chatOpen === false);
  }

  function showPageLauncher(_show) {
    // v0.8: Do not inject a button into the CHZZK page header.
    const launcher = document.getElementById("__chzzk_multiview_launcher_v07__");
    launcher?.remove();
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
    scheduleSyncRender();
    const list = ui.querySelector("#channelList");
    if (!list) return;
    list.innerHTML = state.channels.map((channel, index) => `
      <div class="channel-list-row" data-uid="${escapeHtml(channel.uid)}">
        <div class="channel-list-select">
          <span class="channel-list-index">${index + 1}</span>
          <span class="channel-list-name">${escapeHtml(displayChannelName(channel))}${channel.uid === state.selectedUid ? ' <em class="channel-list-main">메인</em>' : ""}</span>
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
      const items = favoriteItemsForGroup(group);
      const online = items.filter(f=>f.online);
      return `<details class="favorite-list-group" open data-group="${escapeHtml(group)}">
        <summary class="favorite-list-group-summary">
          <span class="favorite-list-group-name">${escapeHtml(group)}</span>
          <span class="favorite-list-group-count">(${items.length})</span>
          ${online.length ? `<button class="favorite-group-open-online" type="button" data-group="${escapeHtml(group)}">온라인 ${online.length}개 멀티뷰</button>` : ''}
        </summary>
        <div class="favorite-list-group-items">
          ${items.map(f => `<div class="favorite-list-row ${f.online ? 'online' : 'offline'}" data-uid="${escapeHtml(f.uid)}">
            <span class="favorite-status-dot ${f.online ? 'online' : ''}"></span>
            <button class="favorite-list-add" title="방송 추가"><span class="favorite-list-text"><span class="favorite-list-identity"><span class="favorite-list-name" title="${escapeHtml(f.name || f.title || f.uid)}">${escapeHtml(f.name || f.title || f.uid)}</span><span class="favorite-list-category" title="${escapeHtml(f.online ? f.category || '-' : '-')}">${escapeHtml(f.online ? f.category || '-' : '-')}</span></span><span class="favorite-list-meta" title="방송 시간 (hh:mm:ss)">${escapeHtml(favoriteDuration(f))}</span><span class="favorite-list-viewers" title="현재 시청자 수"><svg class="viewer-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="4" r="3"/><path d="M2 15v-2a6 6 0 0 1 12 0v2z"/></svg><span class="favorite-list-viewer-count">${escapeHtml(CZFavoritesStore.favoriteViewerText(f))}</span></span></span><span class="favorite-online-badge ${f.online ? 'online':'offline'}">${f.online ? 'ONLINE':'OFFLINE'}</span></button>
          </div>`).join('') || '<div class="favorite-list-empty">이 그룹에 방송이 없습니다.</div>'}
        </div>
      </details>`;
    }).join('');

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

  function showFavoriteModal(kind) {
    const modal = ui?.querySelector(kind === 'items' ? '#favoriteItemModal' : '#favoriteGroupModal');
    if (!modal) return;
    for (const id of ['syncManager', 'volumeManager', 'channelManager']) {
      ui.querySelector(`#${id}`)?.removeAttribute('open');
    }
    modal.classList.add('open');
    if (kind === 'items') renderFavoriteItemManager(); else renderFavoriteGroupManager();
  }
  function closeFavoriteModal(kind) {
    const modal = ui?.querySelector(kind === 'items' ? '#favoriteItemModal' : '#favoriteGroupModal');
    if (modal) modal.classList.remove('open');
  }
  function bindFavoriteDragFeedback(list) {
    const rows = () => list.querySelectorAll('[draggable="true"]');
    const clear = () => rows().forEach(row => row.classList.remove('favorite-dragging', 'favorite-drop-target'));
    list.ondragstart = e => {
      const row = e.target.closest('[draggable="true"]');
      if (!row) return;
      list.dataset.dragging = 'true';
      row.classList.add('favorite-dragging');
      e.dataTransfer.setData('text/plain', row.dataset.uid || row.dataset.group);
    };
    list.ondragover = e => {
      const row = e.target.closest('[draggable="true"]');
      if (!list.dataset.dragging || !row || row.classList.contains('favorite-dragging')) return;
      e.preventDefault();
      rows().forEach(item => item.classList.toggle('favorite-drop-target', item === row));
    };
    list.ondragleave = e => {
      const row = e.target.closest('[draggable="true"]');
      if (row && !row.contains(e.relatedTarget)) row.classList.remove('favorite-drop-target');
    };
    list.ondrop = list.ondragend = () => { delete list.dataset.dragging; clear(); };
    if (list._movedUid) {
      const row = [...rows()].find(row => (row.dataset.uid || row.dataset.group) === list._movedUid);
      if (row && Date.now() < list._movedUntil) {
        row.classList.add('favorite-moved');
        setTimeout(() => row.classList.remove('favorite-moved'), list._movedUntil - Date.now());
      }
    }
  }

  function renderFavoriteGroupManager() {
    const list=ui?.querySelector('#favoriteGroupManageList'); if(!list)return;
    list.innerHTML=favoriteGroups.map((g,i)=>`<div class="favorite-manage-row" data-group="${escapeHtml(g)}" draggable="true"><span class="favorite-manage-drag">⠿</span><span class="favorite-manage-index">${i+1}</span><span class="favorite-manage-name">${escapeHtml(g)}</span><button class="favorite-manage-rename">이름 변경</button><button class="favorite-manage-delete" ${g===DEFAULT_FAVORITE_GROUP?'disabled':''}>삭제</button></div>`).join('');
    list.querySelectorAll('.favorite-manage-rename').forEach(btn => {
      btn.onclick = async () => {
        const old = btn.closest('.favorite-manage-row')?.dataset.group;
        if (!old) return;
        const next = window.prompt('그룹 이름을 입력하세요.', old);
        if (next === null) return;
        const name = next.trim();
        if (!name || (name !== old && favoriteGroups.includes(name))) return;
        applyFavoriteSnapshot(CZFavoritesStore.renameGroup(favorites, favoriteGroups, old, name));
        await saveFavorites();
        renderFavoriteGroupManager();
        refreshFavoriteList();
      };
    });
    list.querySelectorAll('.favorite-manage-delete').forEach(btn => {
      btn.onclick = async () => {
        const group = btn.closest('.favorite-manage-row')?.dataset.group;
        if (!group || group === DEFAULT_FAVORITE_GROUP) return;
        if (!window.confirm(`'${group}' 그룹을 삭제할까요?\n그룹 안의 방송은 기본 그룹으로 이동합니다.`)) return;
        applyFavoriteSnapshot(CZFavoritesStore.deleteGroup(favorites, favoriteGroups, group));
        await saveFavorites();
        renderFavoriteGroupManager();
        refreshFavoriteList();
      };
    });
    list.querySelectorAll('.favorite-manage-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        favDragGroup = row.dataset.group;
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', e => {
        if (favDragGroup && favDragGroup !== row.dataset.group) e.preventDefault();
      });
      row.addEventListener('drop', async e => {
        e.preventDefault();
        const target = row.dataset.group;
        if (!favDragGroup || !target || favDragGroup === target) return;
        list._movedUid = favDragGroup;
        list._movedUntil = Date.now() + 650;
        moveFavoriteGroup(favDragGroup, target);
        favDragGroup = null;
        await saveFavorites();
        renderFavoriteGroupManager();
        refreshFavoriteList();
      });
      row.addEventListener('dragend', () => { favDragGroup = null; });
    });
    bindFavoriteDragFeedback(list);
  }

  function renderFavoriteItemManager() {
    ensureFavoriteGroups();
    const list = ui?.querySelector('#favoriteItemManageList');
    if (!list) return;
    list.innerHTML=favorites.map((f,i)=>`<div class="favorite-manage-row" data-uid="${escapeHtml(f.uid)}" draggable="true"><span class="favorite-manage-drag">⠿</span><span class="favorite-manage-index">${i+1}</span><span class="favorite-manage-name">${escapeHtml(f.name||f.title||f.uid)}</span><select class="favorite-manage-group">${favoriteGroups.map(g=>`<option value="${escapeHtml(g)}" ${g===(f.group||DEFAULT_FAVORITE_GROUP)?'selected':''}>${escapeHtml(g)}</option>`).join('')}</select><button class="favorite-manage-delete-item">삭제</button></div>`).join('')||'<div class="favorite-list-empty">즐겨찾기한 방송이 없습니다.</div>';
    list.querySelectorAll('.favorite-manage-group').forEach(sel => {
      sel.onchange = async () => {
        const uid = sel.closest('.favorite-manage-row')?.dataset.uid;
        if (!favorites.some(f => f.uid === uid)) return;
        applyFavoriteSnapshot(CZFavoritesStore.setFavoriteGroup(favorites, favoriteGroups, uid, sel.value));
        await saveFavorites();
        renderFavoriteItemManager();
        refreshFavoriteList();
      };
    });
    list.querySelectorAll('.favorite-manage-delete-item').forEach(btn => {
      btn.onclick = async () => {
        const uid = btn.closest('.favorite-manage-row')?.dataset.uid;
        if (!uid) return;
        applyFavoriteSnapshot(CZFavoritesStore.removeFavorite(favorites, favoriteGroups, uid));
        await saveFavorites();
        renderFavoriteItemManager();
        refreshFavoriteList();
      };
    });
    list.querySelectorAll('.favorite-manage-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        favDragUid = row.dataset.uid;
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', e => {
        if (favDragUid && favDragUid !== row.dataset.uid) e.preventDefault();
      });
      row.addEventListener('drop', async e => {
        e.preventDefault();
        const target = row.dataset.uid;
        if (!favDragUid || !target || favDragUid === target) return;
        list._movedUid = favDragUid;
        list._movedUntil = Date.now() + 650;
        applyFavoriteSnapshot(CZFavoritesStore.moveFavorite(favorites, favoriteGroups, favDragUid, target));
        favDragUid = null;
        await saveFavorites();
        renderFavoriteItemManager();
        refreshFavoriteList();
      });
      row.addEventListener('dragend', () => { favDragUid = null; });
    });
    bindFavoriteDragFeedback(list);
  }

  function moveFavoriteGroup(fromGroup, toGroup) {
    applyFavoriteSnapshot(CZFavoritesStore.moveGroup(favorites, favoriteGroups, fromGroup, toGroup));
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

  const fetchFavoriteLive = CZFavoritesStore.fetchLiveInfo;

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
    const results = await Promise.all(uids.map(uid => fetchFavoriteLive(uid, { throwOnError: true })));
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
    for (const tile of tileMap.values()) {
      const iframe = tile.querySelector("iframe");
      if (iframe) iframe.src = "about:blank";
      tile.remove();
    }
    tileMap.clear();
    syncOffsets.clear();
    syncDelays.clear();
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
          muted: true,
          volume: 1
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

    // Every new MultiView session starts in Basic layout. The saved channel
    // order is retained only when no explicit popup list was supplied.
    state.layout = "grid";
    state.selectedUid = state.channels[0]?.uid || null;
    // New sessions start with all visible players muted so the button state
    // and actual player state have a predictable baseline.
    for (const channel of state.channels) channel.muted = true;
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
    showPageLauncher(false);

    try {
      chrome.runtime.sendMessage({ type: "COOKIE_BRIDGE_INIT" });
    } catch (_) {}

    opened = true;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;

    if (message.type === "OPEN_MULTIVIEW") {
      openMultiView(message.initialInput || "", message.initialInputs || [])
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    // The main broadcast changes only through the tile's "메인으로 변경" button.
    // Messages from inside a player (e.g. header clicks) are ignored on purpose.
    if (message.type === "PROMOTE_MAIN") return;

    if (message.type === "VIDEO_STATE" && message.uid) {
      const channel = state.channels.find(c => c.uid === message.uid);
      // Ignore the echo of our own SET_VOLUME command.
      if (channel && Date.now() - (lastVolumeSent.get(message.uid) || 0) > 500) {
        const master = clamp01(state.masterVolume ?? 1);
        // Players report the EFFECTIVE volume (tile volume x master volume).
        if (master > 0 && typeof message.volume === "number" && Number.isFinite(message.volume)) {
          channel.volume = clamp01(message.volume / master);
        }
        if (typeof message.muted === "boolean" && !isForcedMuted(channel)) {
          channel.muted = message.muted || clamp01(channel.volume ?? 1) <= 0;
        }
        syncVolumeUI();
        saveStateSoon();
      }
      return;
    }

    if (message.type === "CHANNEL_INFO" && message.uid) {
      const title = String(message.channelName || message.title || "").trim();
      if (title) {
        const channel = state.channels.find(c => c.uid === message.uid);
        if (channel) {
          const streamerName = extractStreamerName(title, message.uid);
          channel.name = streamerName;
          channel.title = streamerName;
          channel.linkTitle = title || streamerName;
          const tile = tileMap.get(message.uid);
          const name = tile?.querySelector(".tile-streamer-name");
          if (name) name.textContent = streamerName;
          refreshChannelManager();
          syncVolumeUI();
          const fav = favorites.find(f => f.uid === message.uid);
          if (fav) {
            fav.title = streamerName;
            fav.name = streamerName;
            CZFavoritesStore.writeInfo({[message.uid]: {name: streamerName, title: streamerName}})
              .then(snapshot => { applyFavoriteSnapshot(snapshot); refreshFavoriteList(); })
              .catch(console.warn);
            refreshFavoriteList();
          }
        }
      }
    }

  });

  showPageLauncher(true);

  // Restore MultiView if it was already open after a CHZZK SPA navigation.
  chrome.storage.local.get(STORAGE_KEY).then(result => {
    if (result[STORAGE_KEY]?.channels?.length) {
      // Do not auto-open; popup controls opening.
    }
  });

  const scheduleGridResize = () => {
    requestAnimationFrame(() => resizeFixedAspectGrid());
  };

  const mvResizeObserver = new ResizeObserver(scheduleGridResize);
  setTimeout(() => {
    if (videoGrid) mvResizeObserver.observe(videoGrid);
    if (ui) mvResizeObserver.observe(ui);
    scheduleGridResize();
  }, 0);

  // A maximized browser can change its CSS viewport when moved between
  // monitors with different resolutions/scaling. Recalculate immediately.
  window.addEventListener("resize", scheduleGridResize, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleGridResize, { passive: true });
  }

  const CSS = `
    /* =========================================================
   CHZZK 멀티뷰
   Main View CSS
   ========================================================= */


/* =========================================================
   01. Base
   ========================================================= */

:host {
    all: initial;
}

* {
    box-sizing: border-box;
}

.mv-root {
    position: fixed;
    inset: 0;
    z-index: 2147483640;

    display: flex;
    flex-direction: column;

    background: #0c0c0d;
    color: #eee;

    font-family: Arial, "Noto Sans KR", sans-serif;
    font-size: 13px;
    line-height: 1.3;
}


/* =========================================================
   02. Toolbar
   ========================================================= */

.mv-toolbar {
    position: relative;

    flex: 0 0 54px;

    display: grid;
    grid-template-columns: minmax(0, 1fr) 200px minmax(0, 1fr);
    align-items: center;
    gap: 12px;

    padding: 8px 12px;

    background: #151516;
    border-bottom: 1px solid #29292b;

    box-shadow: 0 2px 12px rgba(0, 0, 0, .35);
}

.toolbar-left,
.toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;

    min-width: 0;
}

.toolbar-left {
    justify-content: flex-start;
    overflow: visible;
}

.toolbar-right {
    justify-content: flex-end;
}

.toolbar-center {
    min-width: 0;
}


/* =========================================================
   03. Toolbar Buttons
   ========================================================= */

.icon-btn {
    width: 36px;
    padding: 0;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    flex: 0 0 auto;
}

button,
select,
input {
    font: inherit;
}

button,
select {
    height: 34px;
    padding: 0 10px;

    border: 1px solid #363638;
    border-radius: 7px;

    background: #222224;
    color: #eee;

    cursor: pointer;
}

button:hover,
select:hover {
    background: #2b2b2e;
}

.accent {
    background: #00d26a;
    border-color: #00d26a;
    color: #06150d;
    font-weight: 800;
}

.accent:hover {
    background: #16df7b;
}


/* =========================================================
   04. Layout Toggle
   ========================================================= */

.layout-toggle {
    display: inline-flex;
    align-items: center;

    gap: 2px;
    padding: 2px;

    border: 1px solid #363638;
    border-radius: 8px;

    background: #1b1b1d;
}

.layout-toggle-btn {
    height: 30px;
    min-width: 62px;
    padding: 0 10px;

    border: 0;
    border-radius: 6px;

    background: transparent;
    color: #999;

    font-size: 12px;
    font-weight: 700;
}

.layout-toggle-btn:hover {
    background: #29292c;
    color: #eee;
}

.layout-toggle-btn.active {
    background: #00d26a;
    color: #06150d;
}

.layout-toggle-btn.active:hover {
    background: #16df7b;
}


/* =========================================================
   05. Stream Add Area
   ========================================================= */

.add-area {
    display: flex;
    align-items: center;
    gap: 5px;

    flex: 1 1 260px;
    max-width: 430px;
    min-width: 170px;

    height: 40px;
    padding: 3px;

    background: #222224;
    border: 1px solid #363638;
    border-radius: 9px;
}

#uidInput {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;

    height: 32px;
    padding: 0 10px;

    color: #eee;
    background: transparent;
    border: 0;
    border-radius: 6px;

    outline: none;
}

.add-area:focus-within {
    border-color: #00d26a;
    box-shadow: 0 0 0 1px rgba(0, 210, 106, .15);
}

#uidInput.invalid {
    border-color: #ff4d5e;
    animation: shake .18s linear 2;
}

.add-area .accent {
    flex: 0 0 auto;

    height: 32px;
    padding: 0 12px;

    border-radius: 6px;
}


/* =========================================================
   06. Input Animation
   ========================================================= */

@keyframes shake {
    0% {
        transform: translateX(0);
    }

    50% {
        transform: translateX(3px);
    }

    100% {
        transform: translateX(0);
    }
}


/* =========================================================
   07. Volume Manager
   ========================================================= */

.volume-manager {
    position: relative;
    flex: 0 0 auto;
}

.volume-manager > summary {
    list-style: none;

    height: 34px;
    padding: 0 10px;

    display: flex;
    align-items: center;

    border: 1px solid #363638;
    border-radius: 7px;

    background: #222224;
    color: #eee;

    cursor: pointer;
    white-space: nowrap;
    user-select: none;
}

.volume-manager > summary::-webkit-details-marker {
    display: none;
}

.volume-manager > summary::after {
    content: "▾";
    margin-left: 7px;
    color: #999;
}

.volume-manager[open] > summary {
    background: #2b2b2e;
}

.volume-manager-panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 60;

    width: 300px;
    max-height: 460px;

    padding: 10px;

    overflow: auto;

    background: #171719;
    border: 1px solid #343438;
    border-radius: 8px;

    box-shadow: 0 12px 30px rgba(0, 0, 0, .35);
}


/* =========================================================
   08. Volume Controls
   ========================================================= */

.master-volume-top {
    display: flex;
    align-items: center;
    gap: 6px;

    margin-bottom: 5px;
}

.master-volume-top label {
    flex: 1 1 auto;
    margin-bottom: 0;
}

.volume-row label {
    display: flex;
    justify-content: space-between;
    gap: 8px;

    margin-bottom: 5px;

    color: #ddd;
    font-size: 11px;
}

.volume-row input[type="range"],
.tile-volume-row input[type="range"] {
    width: 100%;
    margin: 0;

    accent-color: #00d26a;
    cursor: pointer;
}

.volume-row output,
.tile-volume-row output {
    color: #00d26a;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
}

.volume-help {
    margin: 6px 0 0;

    color: #888;
    font-size: 10.5px;
    line-height: 1.45;
}


/* =========================================================
   09. Main-only Volume
   ========================================================= */

.main-only-check {
    display: flex;
    align-items: flex-start;
    gap: 9px;

    margin-top: 10px;
    padding: 9px 10px;

    border: 1px solid #2c2c30;
    border-radius: 7px;

    background: #1c1c1f;

    cursor: pointer;
    user-select: none;
}

.main-only-check input {
    flex: 0 0 auto;

    width: 16px;
    height: 16px;

    margin: 1px 0 0;

    accent-color: #00d26a;
    cursor: pointer;
}

.main-only-text {
    display: flex;
    flex-direction: column;
    gap: 3px;

    min-width: 0;
}

.main-only-text strong {
    color: #eee;
    font-size: 12px;
}

.main-only-text small {
    color: #888;
    font-size: 10.5px;
    line-height: 1.45;
}


/* =========================================================
   10. Per-Tile Volume
   ========================================================= */

.tile-volume-list {
    display: flex;
    flex-direction: column;
    gap: 10px;

    margin-top: 10px;
    padding-top: 9px;

    border-top: 1px solid #2c2c30;
}

.tile-volume-row.is-forced {
    opacity: .55;
}

.tile-volume-top {
    display: flex;
    align-items: center;
    gap: 7px;

    min-width: 0;
    margin-bottom: 4px;
}

.tile-volume-name {
    flex: 1 1 auto;
    min-width: 0;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    color: #ddd;
    font-size: 11px;
}

.tile-volume-row output {
    flex: 0 0 auto;
}

.tile-mute-btn {
    flex: 0 0 26px;

    width: 26px;
    height: 24px;
    padding: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    border: 1px solid #363638;
    border-radius: 6px;

    background: #222224;
    color: #ddd;
}

.tile-mute-btn.is-muted {
    color: #ff7b86;
    border-color: #5a2d33;
}

.volume-empty {
    padding: 8px;

    color: #777;

    text-align: center;
    font-size: 11px;
}


/* =========================================================
   11. Channel Manager
   ========================================================= */

.channel-manager {
    position: relative;
    flex: 0 0 auto;
}

.channel-manager > summary {
    list-style: none;

    height: 34px;
    padding: 0 10px;

    display: flex;
    align-items: center;

    border: 1px solid #363638;
    border-radius: 7px;

    background: #222224;
    color: #eee;

    cursor: pointer;
    white-space: nowrap;
    user-select: none;
}

.channel-manager > summary::-webkit-details-marker {
    display: none;
}

.channel-manager > summary::after {
    content: "▾";
    margin-left: 7px;
    color: #999;
}

.channel-manager[open] > summary {
    background: #2b2b2e;
}

.channel-manager-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 50;

    width: 260px;
    padding: 8px;

    background: #171719;
    border: 1px solid #363638;
    border-radius: 8px;

    box-shadow: 0 10px 28px rgba(0, 0, 0, .45);
}

.channel-manager-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    padding: 2px 2px 7px;

    border-bottom: 1px solid #2c2c30;

    font-size: 11px;
}

.manager-clear {
    height: 27px;
    padding: 0 8px;

    color: #ff7b86;
}


/* =========================================================
   12. Channel List
   ========================================================= */

.channel-list {
    display: flex;
    flex-direction: column;
    gap: 3px;

    max-height: 280px;

    overflow-y: auto;

    padding-top: 6px;
}

.channel-list-row {
    display: flex;
    align-items: center;
    gap: 4px;

    min-width: 0;
}

.channel-list-select {
    flex: 1;
    min-width: 0;

    height: 30px;
    padding: 0 6px;

    display: flex;
    align-items: center;
    gap: 7px;

    border: 0;
    background: transparent;

    text-align: left;
    cursor: default;
}

.channel-list-index {
    flex: 0 0 18px;

    color: #777;

    text-align: center;
    font-size: 10px;
}

.channel-list-name {
    min-width: 0;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.channel-list-main {
    margin-left: 6px;
    padding: 1px 6px;

    border-radius: 9px;

    background: #00d26a;
    color: #06150d;

    font-size: 9px;
    font-style: normal;
    font-weight: 800;
}

.channel-list-remove,
.channel-list-favorite {
    flex: 0 0 28px;

    width: 28px;
    height: 28px;
    padding: 0;

    border: 0;
    background: transparent;
}

.channel-list-remove {
    color: #999;
}

.channel-list-remove:hover {
    color: #ff6473;
}

.channel-list-favorite {
    color: #f0c75e;
    font-size: 16px;
}

.channel-list-favorite:hover {
    background: #2b2b2e;
}

.channel-list-empty {
    padding: 12px 5px 8px;

    color: #777;

    text-align: center;
    font-size: 11px;
}


/* =========================================================
   13. Favorite Manager
   ========================================================= */

.favorite-manager {
    position: relative;
    flex: 0 0 auto;
}

.favorite-manager > summary {
    list-style: none;

    height: 34px;
    padding: 0 10px;

    display: flex;
    align-items: center;

    border: 1px solid #363638;
    border-radius: 7px;

    background: #222224;
    color: #eee;

    cursor: pointer;
    white-space: nowrap;
    user-select: none;
}

.favorite-manager > summary::-webkit-details-marker {
    display: none;
}

.favorite-manager > summary::after {
    content: "▾";
    margin-left: 7px;
    color: #999;
}

.favorite-manager[open] > summary {
    background: #2b2b2e;
}

.favorite-manager-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 50;

    width: 360px;
    max-height: 430px;

    padding: 8px;

    overflow: hidden;

    background: #171719;
    border: 1px solid #343438;
    border-radius: 8px;

    box-shadow: 0 12px 30px rgba(0, 0, 0, .35);
}

.favorite-manager-tools {
    display: flex;
    gap: 5px;

    margin-bottom: 6px;
}

.favorite-manager-tools button {
    height: 28px;
    padding: 0 8px;

    font-size: 10px;
}

.favorite-manager-tools button:last-child {
    width: 30px;
    margin-left: auto;
    padding: 0;
}

.favorite-filter-row {
    margin-bottom: 6px;
}

#favoriteGroupFilter {
    width: 100%;
    height: 30px;

    font-size: 10px;
}


/* =========================================================
   14. Favorite List
   ========================================================= */

.favorite-list {
    display: flex;
    flex-direction: column;
    gap: 5px;

    width: 100%;
    height: 250px;
    min-height: 0;
    max-height: 250px;

    padding: 5px 3px 5px 5px;

    overflow-y: scroll;
    overflow-x: hidden;

    border: 1px solid #2d2d31;
    border-radius: 8px;

    background: #181819;

    scrollbar-gutter: stable;
}

.favorite-list > .favorite-list-group {
    flex-shrink: 0;
}

.favorite-list-group {
    overflow: hidden;

    border: 1px solid #2d2d31;
    border-radius: 7px;
}

.favorite-list-group-summary {
    list-style: none;

    min-height: 30px;
    padding: 0 7px;

    display: flex;
    align-items: center;
    gap: 6px;

    background: #202023;

    cursor: grab;
    user-select: none;
}

.favorite-list-group-summary::-webkit-details-marker {
    display: none;
}

.favorite-list-group-name {
    min-width: 0;
    flex: 1;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    font-size: 10px;
    font-weight: 800;
}

.favorite-list-group-count {
    color: #777;
    font-size: 9px;
}

.favorite-group-drag-handle {
    color: #666;
}

.favorite-list-group-items {
    padding: 3px;
}

/* =========================================================
   15. Favorite Rows
   ========================================================= */

.favorite-list-row {
    position: relative;

    display: flex;
    align-items: center;
    gap: 4px;

    min-width: 0;

    padding: 4px 5px;

    border: 1px solid transparent;
    border-radius: 6px;
}

.favorite-list-row:has(.favorite-status-dot.online) {
    background: rgba(0, 210, 106, .06);
}

.favorite-list-row.dragging {
    opacity: .45;
    cursor: grabbing;
}

.favorite-list-row.drop-before::before,
.favorite-list-row.drop-after::after {
    content: "";

    position: absolute;
    left: 4px;
    right: 4px;

    height: 2px;

    border-radius: 2px;

    background: #4d9cff;
    box-shadow: 0 0 6px rgba(77, 156, 255, .6);

    pointer-events: none;
}

.favorite-list-row.drop-before::before {
    top: -3px;
}

.favorite-list-row.drop-after::after {
    bottom: -3px;
}


/* 온라인 상태 DOT */

.favorite-status-dot {
    flex: 0 0 auto;

    width: 7px;
    height: 7px;

    border-radius: 50%;

    background: #555;
}

.favorite-status-dot.online {
    background: #00d26a;
    box-shadow: 0 0 6px rgba(0, 210, 106, .55);
}


/* 방송 추가 버튼 */

.favorite-list-add {
    min-width: 0;
    flex: 1 1 auto;

    height: 32px;
    padding: 0 5px;

    display: flex;
    align-items: center;
    gap: 7px;

    border: 0;

    background: transparent;
    color: #eee;

    text-align: left;
}

.favorite-list-name {
    min-width: 0;
    flex: 1;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    font-size: 12px;
}


/* 온라인 / 오프라인 표시 */

.favorite-online-badge {
    flex: 0 0 auto;

    padding: 2px 5px;

    border-radius: 5px;

    font-size: 9px;
    font-weight: 800;
}

.favorite-online-badge.online {
    background: #00d26a;
    color: #07140c;
}

.favorite-online-badge.offline {
    color: #666;
}

.favorite-list-row.dragging {
    opacity: .45;
    cursor: grabbing;
}

.favorite-list-row.drop-before::before,
.favorite-list-row.drop-after::after {
    content: "";

    position: absolute;
    left: 4px;
    right: 4px;

    height: 2px;

    border-radius: 2px;

    background: #4d9cff;
    box-shadow: 0 0 6px rgba(77, 156, 255, .6);

    pointer-events: none;
}

.favorite-list-row.drop-before::before {
    top: -3px;
}

.favorite-list-row.drop-after::after {
    bottom: -3px;
}

.favorite-drag-handle {
    flex: 0 0 14px;

    color: #777;

    font-size: 15px;
    line-height: 1;
    text-align: center;

    user-select: none;
}

.favorite-list-add {
    min-width: 0;
    flex: 1 1 auto;

    min-height: 34px;
    padding: 3px 7px;

    display: flex;
    align-items: center;
    gap: 7px;

    border: 0;
    background: transparent;
    color: #eee;

    text-align: left;
}

.favorite-list-text {
    min-width: 0;
    flex: 1 1 auto;

    display: flex;
    flex-direction: column;
    gap: 1px;
}

/* 방송 카테고리 · 방송 시간 (온라인 방송만 표시) */
.favorite-list-meta {
    min-width: 0;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    color: #d4d4dc;
    font-size: 10px;
    font-weight: 400;
    line-height: 1.25;
}

.favorite-list-name {
    min-width: 0;
    flex: 1 1 auto;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    font-size: 12px;
    font-weight: 700;
}

.favorite-row-group {
    flex: 0 0 72px;

    width: 72px;
    height: 27px;
    padding: 0 3px;

    font-size: 9px;
}

.favorite-list-uid {
    flex: 0 1 38%;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    color: #777;
    font-size: 10px;
}

.favorite-list-toggle {
    flex: 0 0 30px;

    width: 30px;
    height: 30px;
    padding: 0;

    border: 0;

    background: transparent;
    color: #f0c75e;

    font-size: 16px;
}

.favorite-list-toggle:hover {
    background: #303034;
}

.favorite-list-empty {
    padding: 12px 5px;

    color: #777;

    text-align: center;
    font-size: 11px;
}


/* =========================================================
   16. Favorite Group Online Button
   ========================================================= */

.favorite-group-open-online {
    margin-left: auto;

    height: 24px;
    padding: 0 7px;

    border: 1px solid #315f47;
    border-radius: 6px;

    background: #193224;
    color: #62e59a;

    font-size: 9px;

    cursor: pointer;
}

.favorite-group-open-online:hover {
    background: #21412f;
}


/* =========================================================
   17. Favorite Modal
   ========================================================= */

.favorite-modal {
    position: fixed;
    inset: 0;
    z-index: 120;

    display: none;
    align-items: center;
    justify-content: center;

    padding: 12px;

    background: rgba(0, 0, 0, .62);
}

.favorite-modal.open {
    display: flex;
}

.favorite-dialog {
    width: 360px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);

    padding: 10px;

    display: flex;
    flex-direction: column;

    overflow: hidden;

    border: 1px solid #3b3b40;
    border-radius: 9px;

    background: #171719;

    box-shadow: 0 18px 45px rgba(0, 0, 0, .55);
}

.favorite-dialog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;

    padding: 2px 2px 8px;

    color: #eee;
    font-size: 12px;
}

.favorite-dialog-head button {
    width: 26px;
    height: 26px;
    padding: 0;

    border: 0;

    background: transparent;
    color: #888;
}

.favorite-dialog-head button:hover {
    color: #ff6473;
}

.favorite-modal-add {
    height: 29px;
    margin-bottom: 7px;

    border: 1px solid #38383d;
    border-radius: 6px;

    background: #252529;
    color: #ddd;
}

.favorite-modal-help {
    margin: 0 0 7px;

    color: #888;
    font-size: 9px;
    line-height: 1.4;
}

.favorite-manage-list {
    min-height: 0;

    overflow: auto;

    border: 1px solid #2d2d31;
    border-radius: 7px;
}

.favorite-manage-row {
    display: flex;
    align-items: center;
    gap: 6px;

    min-height: 34px;
    padding: 4px 6px;

    border-bottom: 1px solid #29292d;
}

.favorite-manage-row:last-child {
    border-bottom: 0;
}

.favorite-manage-row[draggable="true"] {
    cursor: grab;
}

.favorite-manage-drag {
    color: #666;
}

.favorite-manage-index {
    width: 22px;

    color: #777;

    text-align: center;
    font-size: 9px;
}

.favorite-manage-name {
    min-width: 0;
    flex: 1;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    font-size: 10px;
}

.favorite-manage-row button {
    height: 25px;
    padding: 0 6px;

    border-radius: 5px;

    background: #252529;
    color: #aaa;

    font-size: 9px;
}

.favorite-manage-row button:hover {
    color: #ff6473;
}

.favorite-manage-row button:disabled {
    opacity: .3;
    cursor: not-allowed;
}

.favorite-manage-group {
    width: 78px;
    height: 25px;

    font-size: 9px;
}


/* =========================================================
   18. Stream Information
   ========================================================= */

.stream-info-panel {
    display: flex;
    flex-direction: column;
    gap: 5px;

    margin: 8px 0 6px;
    padding: 7px;

    border: 1px solid #2d2d31;
    border-radius: 7px;

    background: #1b1b1e;
}

.stream-info-row {
    padding: 6px 7px;

    border-radius: 5px;

    background: #151517;
}

.stream-info-name {
    margin-bottom: 5px;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    color: #eee;

    font-size: 10.5px;
    font-weight: 800;
}

.stream-info-name em {
    margin-left: 5px;
    padding: 1px 5px;

    border-radius: 8px;

    background: #00d26a;
    color: #06150d;

    font-size: 8px;
    font-style: normal;
}

.stream-info-values {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
}

.stream-info-values span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    color: #777;
    font-size: 9px;
}

.stream-info-values b {
    color: #ddd;

    font-size: 9.5px;
    font-variant-numeric: tabular-nums;
}

.stream-info-empty {
    color: #777;
    font-size: 10px;
    line-height: 1.4;
}


/* =========================================================
   19. Center Controls
   ========================================================= */

.center-controls {
    position: absolute;
    top: 5px;
    left: 50%;
    z-index: 45;

    width: 200px;
    height: 44px;

    transform: translateX(-50%);

    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}

.center-controls .center-btn {
    height: 32px;
    padding: 0 11px;

    opacity: 0;
    transform: translateY(-4px);

    pointer-events: none;

    transition:
        opacity .14s ease,
        transform .14s ease,
        background .12s ease;

    font-weight: 800;
    white-space: nowrap;
}

.center-controls:hover .center-btn,
.center-controls:has(.center-btn:focus-visible) .center-btn {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
}

.center-controls .center-collapse {
    width: 38px;
    padding: 0;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    background: #00d26a;
    border-color: #00d26a;
    color: #06150d;
}

.center-controls .center-collapse:hover {
    background: #16df7b;
}

#closeBtn {
    width: 34px;
    padding: 0;

    color: #bbb;
}


/* =========================================================
   20. Main Body
   ========================================================= */

.mv-body {
    min-height: 0;
    flex: 1 1 auto;

    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 8px;

    padding: 8px;

    overflow: hidden;
}


/* Chat on left */
.chat-left:not(.chat-closed) .mv-body {
    grid-template-columns: 320px minmax(0, 1fr);
}

.chat-left .chat-panel {
    order: -1;
}


/* Chat closed */
.chat-closed .chat-panel {
    display: none;
}

.chat-closed .mv-body {
    grid-template-columns: minmax(0, 1fr);
}


/* =========================================================
   21. Video Grid
   ========================================================= */

.video-grid {
    min-width: 0;
    min-height: 0;

    display: grid;

    gap: 8px;

    overflow: hidden;

    align-content: center;
}

.layout-grid {
    place-items: stretch;

    align-content: center;
    justify-content: center;
}

.layout-grid .video-tile {
    min-height: 0;

    aspect-ratio: 16 / 9;
}


/* =========================================================
   22. Main / Sub Layout
   ========================================================= */

.layout-main-sub {
    grid-template-columns:
        minmax(0, 1fr)
        minmax(0, 3fr);

    grid-template-rows:
        repeat(3, minmax(0, 1fr));

    align-content: stretch;

    grid-auto-flow: row;

    gap: 8px;
}

.layout-main-sub .video-tile {
    grid-column: 1;

    width: 100%;
    height: 100%;

    min-height: 0;

    aspect-ratio: auto;
}

.layout-main-sub .main-tile {
    grid-column: 2;
    grid-row: 1 / 4;

    min-height: 0;

    aspect-ratio: auto;
}


/* =========================================================
   23. Video Tile
   ========================================================= */

.video-tile {
    position: relative;

    min-width: 0;
    min-height: 0;

    display: flex;
    flex-direction: column;

    overflow: hidden;

    background: #111113;

    border: 2px solid #2c2c30;
    border-radius: 8px;

    transition:
        border-color .12s ease,
        box-shadow .12s ease,
        opacity .12s ease;
}

.video-tile.selected {
    border-color: #00d26a;

    box-shadow:
        0 0 0 1px rgba(0, 210, 106, .7),
        0 0 16px rgba(0, 210, 106, .24);
}

.video-tile.drop-target {
    border-color: #4d9cff;
    box-shadow: 0 0 18px rgba(77, 156, 255, .3);
}

.video-tile.dragging {
    opacity: .55;
}


/* =========================================================
   24. Tile Header
   ========================================================= */

.tile-head {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 5;

    height: 32px;
    padding: 0 7px;

    display: flex;
    align-items: center;
    gap: 6px;

    background: #19191b;
    border-bottom: 1px solid #2c2c30;

    user-select: none;

    opacity: 0;
    transform: translateY(-4px);

    transition:
        opacity .12s ease,
        transform .12s ease;
}

.video-tile:hover .tile-head {
    opacity: 1;
    transform: translateY(0);
}

.drag-handle {
    color: #777;

    cursor: grab;

    font-size: 16px;
    line-height: 1;
}

.drag-handle:active {
    cursor: grabbing;
}

.tile-streamer-name {
    position: absolute;
    left: 50%;

    max-width: 42%;
    min-width: 0;

    transform: translateX(-50%);

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    color: #eee;

    font-size: 11px;
    font-weight: 700;
}

.tile-head-spacer {
    flex: 1 1 auto;
    min-width: 0;
}


/* =========================================================
   25. Tile Header Buttons
   ========================================================= */

.main-btn {
    flex: 0 0 auto;

    height: 24px;
    padding: 0 8px;

    border: 1px solid #3a3a3e;
    border-radius: 5px;

    background: transparent;
    color: #ccc;

    font-size: 10px;
    font-weight: 800;

    white-space: nowrap;
}

.main-btn:hover:not(:disabled) {
    background: #00d26a;
    border-color: #00d26a;
    color: #06150d;
}

.main-btn:disabled,
.main-btn.is-main {
    background: #00d26a;
    border-color: #00d26a;
    color: #06150d;

    cursor: default;
}

.tile-address {
    flex: 0 0 72px;

    width: 72px;
    height: 24px;

    padding: 0 5px;

    overflow: hidden;

    border: 1px solid #3a3a3e;
    border-radius: 5px;

    background: transparent;
    color: #bbb;

    text-align: center;

    font-size: 10px;
    font-weight: 700;
    line-height: 22px;

    cursor: pointer;
}

.tile-address:hover {
    border-color: #00d26a;
    background: #00d26a;
    color: #06150d;
}

.tile-btn {
    flex: 0 0 27px;

    width: 27px;
    height: 25px;
    padding: 0;

    border: 0;

    background: transparent;
    color: #bbb;
}

.tile-btn:hover {
    background: #303034;
}

.remove-btn:hover {
    color: #ff6473;
}

#screenLockBtn.lock-active {
    background: #00d26a;
    border-color: #00d26a;
    color: #06150d;

    font-weight: 800;
}


/* =========================================================
   26. Screen Lock
   ========================================================= */

.tile-lock-shield {
    position: absolute;
    inset: 0;
    z-index: 4;

    display: none;

    background: transparent;

    cursor: default;
}

.video-tile.screen-locked .tile-lock-shield {
    display: block;
}


/* =========================================================
   27. Video Content
   ========================================================= */

.tile-content {
    position: relative;

    min-width: 0;
    min-height: 0;

    flex: 1 1 auto;

    overflow: hidden;

    background: #000;
}

.tile-content iframe {
    display: block;

    width: 100%;
    height: 100%;

    min-width: 0;
    min-height: 0;

    border: 0;

    overflow: hidden;

    background: #000;
}


/* =========================================================
   28. Chat
   ========================================================= */

.chat-panel {
    min-width: 0;
    min-height: 0;

    display: flex;
    flex-direction: column;

    overflow: hidden;

    background: #121214;

    border: 1px solid #2c2c30;
    border-radius: 8px;
}

.chat-head {
    flex: 0 0 36px;

    display: flex;
    align-items: center;
    gap: 8px;

    padding: 0 10px;

    border-bottom: 1px solid #2c2c30;

    background: #19191b;
}

.chat-close {
    flex: 0 0 28px;

    width: 28px;
    height: 26px;

    padding: 0;
    margin-left: 4px;

    border: 0;

    background: transparent;
}

.chat-close:hover {
    color: #ff6473;
}

.chat-head span {
    margin-left: auto;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    color: #777;

    font-size: 10px;
}


/* =========================================================
   29. Chat Frame
   ========================================================= */

.chat-frame-wrap {
    position: relative;

    width: 100%;
    height: 0;

    min-width: 0;
    min-height: 0;

    flex: 1 1 auto;

    overflow: hidden;

    background: #111;
}

.chat-frame {
    display: block;

    width: 100%;
    height: 100%;

    min-width: 0;
    min-height: 0;

    border: 0;

    overflow: hidden;

    background: #111;
}

.chat-empty {
    position: absolute;
    inset: 0;
    z-index: 2;

    display: grid;
    place-items: center;

    background: #111;
    color: #777;

    text-align: center;
    line-height: 1.7;
}


/* =========================================================
   30. Toolbar Collapse
   ========================================================= */

.toolbar-collapsed .mv-toolbar {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 20;

    transform: translateY(-100%);
}


/* =========================================================
   31. Notice
   ========================================================= */

/* =========================================================
   Sync (싱크 조정)
   ========================================================= */

.sync-panel {
    width: 360px;
}

.sync-badge {
    margin-left: 6px;
    padding: 1px 6px;

    border-radius: 9px;

    background: #00d26a;
    color: #06150d;

    font-size: 10px;
    font-weight: 800;
}

.sync-badge[hidden] {
    display: none;
}

.sync-summary {
    padding-bottom: 9px;
    border-bottom: 1px solid #2c2c30;
}

.sync-summary-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    margin-bottom: 6px;
}

.sync-summary-head strong {
    color: #eee;
    font-size: 12px;
}

.sync-summary-head .manager-clear:disabled {
    opacity: .4;
    cursor: default;
}

.sync-summary-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}

.sync-chip {
    padding: 3px 8px;

    border: 1px solid rgba(0, 210, 106, .5);
    border-radius: 12px;

    background: rgba(0, 210, 106, .1);
    color: #00d26a;

    font-size: 11px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
}

.sync-chip b {
    margin-right: 5px;

    color: #fff;
    font-weight: 700;
}

.sync-summary-empty {
    color: #777;
    font-size: 11px;
}

.sync-list {
    display: flex;
    flex-direction: column;
    gap: 8px;

    margin-top: 10px;
}

.sync-row {
    padding: 8px;

    border: 1px solid #2c2c30;
    border-radius: 8px;

    background: #1c1c1f;
}

.sync-row.is-main {
    border-color: rgba(0, 210, 106, .45);
}

.sync-row-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;

    min-width: 0;
    margin-bottom: 7px;
}

.sync-name {
    min-width: 0;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    color: #eee;
    font-size: 12px;
    font-weight: 700;
}

.sync-values {
    flex: 0 0 auto;

    display: flex;
    gap: 10px;

    color: #888;
    font-size: 11px;
}

.sync-values i {
    color: #ddd;
    font-style: normal;
    font-variant-numeric: tabular-nums;
}

.sync-values i.is-adjusted {
    color: #00d26a;
    font-weight: 800;
}

.sync-note {
    margin-bottom: 6px;

    color: #777;
    font-size: 10.5px;
}

.sync-btns {
    display: grid;
    grid-template-columns: repeat(4, 1fr) 1.5fr;
    gap: 5px;
}

.sync-btns button {
    height: 28px;
    padding: 0;

    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.sync-btns button:disabled {
    opacity: .4;
    cursor: default;
}

.mv-notice {
    position: fixed;
    left: 50%;
    bottom: 22px;
    z-index: 100;

    padding: 9px 15px;

    transform: translate(-50%, 10px);

    border: 1px solid #3b3b40;
    border-radius: 7px;

    background: rgba(25, 25, 28, .94);
    color: #eee;

    font-size: 12px;
    font-weight: 700;

    opacity: 0;
    pointer-events: none;

    transition:
        opacity .14s ease,
        transform .14s ease;

    box-shadow: 0 8px 24px rgba(0, 0, 0, .3);
}

.mv-notice.show {
    opacity: 1;
    transform: translate(-50%, 0);
}


/* =========================================================
   32. Responsive
   ========================================================= */

@media (max-width: 900px) {
    .mv-body {
        grid-template-columns: minmax(0, 1fr) 260px;
    }

    .chat-left:not(.chat-closed) .mv-body {
        grid-template-columns: 260px minmax(0, 1fr);
    }
}

/* Favorite manager drag feedback */
.favorite-dragging { opacity: .45; }
.favorite-drop-target { outline: 2px solid #00dc9b; outline-offset: -2px; background: rgba(0,220,155,.12); }
.favorite-moved { animation: favorite-moved-pulse .65s ease-out; }
@keyframes favorite-moved-pulse { from { background: rgba(0,220,155,.3); } to { background: transparent; } }
@media (prefers-reduced-motion: reduce) { .favorite-moved { animation: none; outline: 2px solid #00dc9b; } }

.favorite-list-add .favorite-online-badge { display: none; }

.favorite-list-row.offline .favorite-list-category, .favorite-list-row.offline .favorite-list-meta, .favorite-list-row.offline .favorite-list-viewers { display: none; }
.favorite-list-row.offline .favorite-list-text { grid-template-columns: minmax(0, 1fr); }

/* Content-sized duration/viewers leave the remaining width for name/category. */
.favorite-list-text { display: grid; grid-template-columns: minmax(0, 1fr) max-content max-content; align-items: center; gap: 4px; white-space: nowrap; }
.favorite-list-identity { display: flex; flex-direction: row; align-items: center; min-width: 0; gap: 2px; }
.favorite-list-name, .favorite-list-category { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.favorite-list-name { flex: 1 1 auto; font-size: 14px; }
.favorite-list-category { flex: 0 1 auto; max-width: 40%; color: #00dc9b; font-size: 10px; padding-left: 1px; }
.favorite-list-meta { white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 700; text-align: left; }
.favorite-list-viewers { display: inline-flex; justify-content: flex-end; align-items: center; gap: 3px; color: #ff7474; font-size: 12px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.favorite-list-viewers .viewer-icon { flex: 0 0 12px; }
.favorite-list-group-name { flex: 0 1 auto; }
.favorite-list-group-count { margin-left: 0; flex: 0 0 auto; white-space: nowrap; }

.favorite-list-add { min-height: 24px; }
  `;
})();
