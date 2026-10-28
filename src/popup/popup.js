const DEFAULT_GROUP = CZFavoritesStore.DEFAULT_GROUP;

const statusEl = document.getElementById("status");
const uidInput = document.getElementById("uidInput");
const favoritesEl = document.getElementById("favorites");
const multiListEl = document.getElementById("multiList");
const versionEl = document.getElementById("version");
let favorites = [];
let favoriteGroups = [DEFAULT_GROUP];
let multiList = [];

function setStatus(text, error = false) {
  statusEl.textContent = text;
  statusEl.style.color = error ? "#ff7070" : "#999";
}

function uidFromInput(value) {
  return CZSessionStore.parseInput(value)?.uid || null;
}

function renderVersion() {
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;
}

const favoriteDuration = CZFavoritesStore.favoriteDuration;

function applyFavoriteSnapshot(snapshot) {
  favorites = snapshot.favorites;
  favoriteGroups = snapshot.groups;
}

function ensureGroups() {
  applyFavoriteSnapshot(CZFavoritesStore.snapshot(favorites, favoriteGroups));
}


function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
}

function getGroupItems(group) {
  return CZFavoritesStore.itemsForGroup(favorites, group);
}

function renderFavorites() {
  ensureGroups();
  const groups = favoriteGroups;

  favoritesEl.innerHTML = groups.map(group => {
    const allItems = getGroupItems(group);
    const items = CZGroupManager.visibleItems(group, allItems);
    return `<details class="favorite-group" open data-group="${escapeHtml(group)}">
      <summary class="favorite-group-summary">
        <span class="group-name">${escapeHtml(group)}</span>
        <span class="favorite-group-count">(${allItems.length})</span>
        ${items.some(f => f.online) ? `<button class="group-open-online" type="button" data-group="${escapeHtml(group)}">온라인 ${items.filter(f=>f.online).length}개 멀티뷰</button>` : ''}
      </summary>
      <div class="favorite-group-items">${items.map(renderFavoriteRow).join("") || '<div class="favorite-empty">표시할 방송이 없습니다.</div>'}</div>
    </details>`;
  }).join("");

  bindFavoriteEvents();
  CZGroupManager.decorate(document);
}

function renderFavoriteRow(fav) {
  return `<div class="favorite-row ${fav.online ? "online" : "offline"}" data-uid="${escapeHtml(fav.uid)}">
    <button class="favorite-main" title="멀티뷰 목록에 추가">
      <span class="favorite-status ${fav.online ? "online" : ""}"></span>
      <span class="favorite-text">
        <span class="favorite-identity"><span class="favorite-name" title="${escapeHtml(fav.name || fav.title || fav.uid)}">${escapeHtml(fav.name || fav.title || fav.uid)}</span>
        <span class="favorite-category" title="${escapeHtml(fav.online ? fav.category || '-' : '-')}">${escapeHtml(fav.online ? fav.category || '-' : '-')}</span></span><span class="favorite-meta" title="방송 시간 (hh:mm:ss)">${escapeHtml(favoriteDuration(fav))}</span><span class="favorite-viewers" title="현재 시청자 수"><svg class="viewer-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="4" r="3"/><path d="M2 15v-2a6 6 0 0 1 12 0v2z"/></svg><span class="favorite-viewer-count">${escapeHtml(CZFavoritesStore.favoriteViewerText(fav))}</span></span>
      </span>
      ${fav.online ? '<span class="online-badge">ONLINE</span>' : '<span class="offline-badge">OFFLINE</span>'}
    </button>
  </div>`;
}

function bindFavoriteEvents() {
  favoritesEl.querySelectorAll('.favorite-main').forEach(btn => btn.addEventListener('click', () => {
    const uid = btn.closest('.favorite-row')?.dataset.uid;
    if (uid) addToList(uid);
  }));
  favoritesEl.querySelectorAll('.group-open-online').forEach(btn => btn.addEventListener('click', async e => {
    e.preventDefault(); e.stopPropagation();
    getGroupItems(btn.dataset.group).filter(f => f.online).forEach(f => addToList(f.uid));
    await openMultiView();
  }));
}

function renderList() {
  multiListEl.innerHTML = "";
  if (!multiList.length) {
    multiListEl.innerHTML = `<div class="list-empty">추가된 방송이 없습니다.</div>`;
    return;
  }
  multiList.forEach((item, i) => {
    const row = document.createElement("div"); row.className = "multi-row";
    const text = document.createElement("div"); text.className = "multi-row-text";
    text.textContent = `${item.name || item.title || item.uid}  ${item.uid}`;
    const del = document.createElement("button"); del.className = "row-del"; del.textContent = "✕";
    del.onclick = () => { multiList.splice(i, 1); renderList(); };
    row.append(text, del); multiListEl.appendChild(row);
  });
}

async function loadFavorites({refreshOnline = false} = {}) {
  const snapshot = await CZFavoritesStore.read();
  favorites = snapshot.favorites;
  favoriteGroups = snapshot.groups;
  if (refreshOnline) await refreshFavoriteOnlineStatus(false);
  renderFavorites();
  renderList();
}

async function saveFavorites() {
  applyFavoriteSnapshot(CZFavoritesStore.snapshot(favorites, favoriteGroups));
  await CZFavoritesStore.write(favorites, favoriteGroups);
}

const fetchLiveInfo = CZChzzkApi.fetchFavoriteInfo;

let favoriteRefreshInFlight = null;
function refreshFavoriteOnlineStatus(...args) {
  if (favoriteRefreshInFlight) return favoriteRefreshInFlight;
  favoriteRefreshInFlight = performFavoriteOnlineRefresh(...args).finally(() => { favoriteRefreshInFlight = null; });
  return favoriteRefreshInFlight;
}

async function performFavoriteOnlineRefresh(showStatus = true, {persist = showStatus} = {}) {
  if (!favorites.length) return;
  if (showStatus) setStatus("즐겨찾기 온라인 상태를 확인하는 중...");
  const uids = favorites.map(f => f.uid);
  const results = await CZChzzkApi.parallelMap(uids, uid => fetchLiveInfo(uid, {throwOnError: true}));
  const updates = Object.fromEntries(uids.map((uid, i) => [uid, results[i]]));
  if (persist) applyFavoriteSnapshot(await CZFavoritesStore.writeInfo(updates));
  else favorites = CZFavoritesStore.mergeInfo(favorites, updates);
  if (showStatus) setStatus("즐겨찾기 온라인 상태를 갱신했습니다.");
}

function addToList(value = uidInput.value) {
  const uid = uidFromInput(value);
  if (!uid) { setStatus("올바른 방송 URL 또는 UID를 입력해주세요.", true); uidInput.focus(); return false; }
  if (!multiList.some(x => x.uid === uid)) {
    const fav = favorites.find(f => f.uid === uid);
    multiList.push({ uid, name: fav?.name || fav?.title || "" });
  }
  renderList();
  if (value === uidInput.value) { uidInput.value = ""; uidInput.focus(); }
  return true;
}

async function openMultiView() {
  const current = uidFromInput(uidInput.value);
  if (uidInput.value.trim() && !current) { setStatus("올바른 방송 URL 또는 UID를 입력해주세요.", true); return; }
  if (current) addToList(uidInput.value);
  setStatus("새 멀티뷰 창을 여는 중...");
  try {
    const result = await chrome.runtime.sendMessage({
      type: "OPEN_MULTIVIEW_FROM_POPUP",
      initialInputs: multiList.map(x => x.uid.startsWith('video:') ? `video/${x.uid.slice(6)}` : x.uid)
    });
    if (!result?.ok) { setStatus("멀티뷰 페이지를 열지 못했습니다.", true); return; }
    setStatus("새 멀티뷰 창을 열었습니다.");
    window.close();
  } catch (err) { setStatus("멀티뷰를 열지 못했습니다.", true); }
}

uidInput.addEventListener("keydown", e => { if (e.key === "Enter") addToList(); });
document.getElementById("addList").addEventListener("click", () => addToList());
document.getElementById("clearList").addEventListener("click", () => { multiList = []; renderList(); });
document.getElementById("open").addEventListener("click", openMultiView);

// 관리 버튼은 팝업 전체 영역에서 위임 처리하여 동적으로 렌더링되는 UI와도 동일하게 동작하도록 한다.
document.getElementById('manageGroups').addEventListener('click', () => groupManager.open().catch(error => setStatus(error.message, true)));
document.getElementById('refreshFavorites').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try { await loadFavorites(); await refreshFavoriteOnlineStatus(true); renderFavorites(); }
  catch (error) {setStatus('온라인 상태 조회에 실패했습니다. 기존 상태를 유지합니다.',true);}
  finally {document.getElementById('refreshFavorites').disabled = false;}
});
const groupManager = CZGroupManager.attach({root: document,
  onSaved: snapshot => { applyFavoriteSnapshot(snapshot); renderFavorites(); renderList(); },
  onAdd: channel => addToList(channel.uid)
});

// 방송 시간은 시간이 지남에 따라 늘어나므로, 새로 조회하지 않고 저장된 시작 시각으로 갱신한다.
setInterval(() => {
  favoritesEl.querySelectorAll(".favorite-row").forEach(row => {
    const fav = favorites.find(f => f.uid === row.dataset.uid);
    const meta = row.querySelector(".favorite-meta");
    if (fav && meta) meta.textContent = favoriteDuration(fav);
  });
}, 1000);

// Poll without replacing the list while an earlier query is still running.
setInterval(async () => {
  if (favoriteRefreshInFlight || document.querySelector('[data-dragging="true"]')) return;
  try {
    await refreshFavoriteOnlineStatus(false, {persist: true});
    renderFavorites();
  } catch (error) { console.warn("즐겨찾기 자동 상태 조회 실패:", error); }
}, 30000);

renderVersion();
// Apply remote changes without echoing writes to storage.
let favoritesReloadPending = false;
CZFavoritesStore.subscribe(() => {
  if (favoritesReloadPending) return;
  favoritesReloadPending = true;
  queueMicrotask(async () => {
    favoritesReloadPending = false;
    try {
      await loadFavorites();
      groupManager.sync();
    } catch (err) { console.warn("즐겨찾기 동기화 실패", err); }
  });
});
loadFavorites({refreshOnline: true}).catch(err => setStatus(String(err), true));
