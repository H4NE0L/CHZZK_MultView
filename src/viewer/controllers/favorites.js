export function create(context) {
  const {scope,showNotice,refreshChannelManager,escapeHtml}=context;
  const addToListFromFavorite=favorite=>context.addFavorite(favorite);
  let favorites=[],favoriteGroups=[],groupManager=null;
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

  const favoriteDuration = CZFavoritesStore.favoriteDuration;

  // The broadcast time keeps growing, so refresh it from the stored start time.
  function updateFavoriteMeta() {
    const ui=context.ui;
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
    const ui=context.ui;
    if (!ui) return;
    ensureFavoriteGroups();
    const list = ui.querySelector("#favoriteList");
    if (!list) return;

    const displayGroups=[...favoriteGroups,...(favoriteItemsForGroup('').length?['']:[])];
    list.innerHTML = displayGroups.map(group => {
      const allItems = favoriteItemsForGroup(group);
      const items = CZGroupManager.visibleItems(group, allItems);
      const online = items.filter(f=>f.online);
      return `<details class="favorite-list-group" open data-group="${escapeHtml(group)}">
        <summary class="favorite-list-group-summary">
          <span class="favorite-list-group-name">${escapeHtml(group || '그룹 없음')}</span>
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
    if(scope.isDisposed)return;
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
    if(scope.isDisposed)return;
    refreshFavoriteList();
    if (notify) showNotice(persist
      ? "즐겨찾기 온라인 상태를 갱신했습니다."
      : "현재 화면의 온라인 상태를 갱신했습니다. 확장 연결이 끊겨 저장·다른 화면 동기화는 사용할 수 없습니다.");
  }

  function isFavorite(uid) { return favorites.some(f => f.uid === uid); }

  function toggleFavorite(uid, title = uid) {
    if (isFavorite(uid)) favorites = favorites.filter(f => f.uid !== uid);
    else { const nextOrder=favorites.reduce((max,f)=>Math.max(max,Number(f.order)||0),0)+1; favorites.push({ uid, name:title||uid, title:title||uid, group:'', groups:[], online:false, openAt:null, category:"", order:nextOrder }); }
    ensureFavoriteGroups();
    saveFavorites().catch(console.warn);
    refreshFavoriteList();
    refreshChannelManager();
  }

  function bind(){
    const ui=context.ui;
    groupManager = CZGroupManager.attach({root: ui, getActiveChannels: () => context.state.channels,
      onSaved: snapshot => { applyFavoriteSnapshot(snapshot); refreshFavoriteList(); refreshChannelManager(); },
      onAdd: channel => addToListFromFavorite(channel),
      onOpen: kind => { for (const id of ['syncManager','volumeManager','channelManager']) ui.querySelector(`#${id}`)?.removeAttribute('open'); if(kind==='following') ui.querySelector('#favoriteManager').removeAttribute('open'); }
    });
    ui.querySelector('#followingManager').addEventListener('toggle', () => {if(ui.querySelector('#followingManager').open) ui.querySelector('#favoriteManager').removeAttribute('open');});
    ui.querySelector('#favoriteManager').addEventListener('toggle', () => {if(ui.querySelector('#favoriteManager').open) ui.querySelector('#followingManager').removeAttribute('open');});
    ui.querySelector('#favoriteManageGroups').addEventListener('click', () => groupManager.open().catch(error => showNotice(error.message)));

    // Storage is shared across popup and multiview; never write on change notification.
    let syncPending = false;
    scope.add(CZFavoritesStore.subscribe(() => {
      if (syncPending) return;
      syncPending = true;
      queueMicrotask(async () => {
        syncPending = false;
        if(scope.isDisposed)return;
        try {
          await loadFavorites();
          if(scope.isDisposed)return;
          refreshFavoriteList();
          if(!scope.isDisposed)groupManager.sync();
        } catch (err) { console.warn("즐겨찾기 동기화 실패:", err); }
      });
    }));

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

    scope.interval(updateFavoriteMeta, 1000);
    scope.interval(() => {
      if (favoriteRefreshInFlight || ui.querySelector('[data-dragging="true"]')) return;
      refreshFavoriteOnlineStatus(false).catch(error => console.warn("즐겨찾기 자동 상태 조회 실패:", error));
    }, 30000);
  }
  return {get items(){return favorites;},get groups(){return favoriteGroups;},load:loadFavorites,apply:applyFavoriteSnapshot,refresh:refreshFavoriteList,
    refreshOnline:refreshFavoriteOnlineStatus,isFavorite,toggle:toggleFavorite,bind,refreshActive(){groupManager?.refreshActive();}};
}
