const DEFAULT_GROUP = CZFavoritesStore.DEFAULT_GROUP;

const statusEl = document.getElementById("status");
const uidInput = document.getElementById("uidInput");
const favoritesEl = document.getElementById("favorites");
const multiListEl = document.getElementById("multiList");
const versionEl = document.getElementById("version");
let favorites = [];
let favoriteGroups = [DEFAULT_GROUP];
let multiList = [];
let draggedFavoriteUid = null;

function setStatus(text, error = false) {
  statusEl.textContent = text;
  statusEl.style.color = error ? "#ff7070" : "#999";
}

function uidFromInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{6,}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const m = url.pathname.match(/^\/live\/([^/?#]+)/);
    return m ? m[1] : null;
  } catch (_) { return null; }
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
    const items = getGroupItems(group);
    return `<details class="favorite-group" open data-group="${escapeHtml(group)}">
      <summary class="favorite-group-summary">
        <span class="group-name">${escapeHtml(group)}</span>
        <span class="favorite-group-count">(${items.length})</span>
        ${items.some(f => f.online) ? `<button class="group-open-online" type="button" data-group="${escapeHtml(group)}">온라인 ${items.filter(f=>f.online).length}개 멀티뷰</button>` : ''}
      </summary>
      <div class="favorite-group-items">${items.map(renderFavoriteRow).join("") || '<div class="favorite-empty">등록된 방송이 없습니다.</div>'}</div>
    </details>`;
  }).join("");

  bindFavoriteEvents();
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

function moveGroup(group, targetGroup) {
  applyFavoriteSnapshot(CZFavoritesStore.moveGroup(favorites, favoriteGroups, group, targetGroup));
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

const fetchLiveInfo = CZFavoritesStore.fetchLiveInfo;

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
  const results = await Promise.all(uids.map(uid => fetchLiveInfo(uid, {throwOnError: true})));
  const updates = Object.fromEntries(uids.map((uid, i) => [uid, results[i]]));
  if (persist) applyFavoriteSnapshot(await CZFavoritesStore.writeInfo(updates));
  else favorites = CZFavoritesStore.mergeInfo(favorites, updates);
  if (showStatus) setStatus("즐겨찾기 온라인 상태를 갱신했습니다.");
}

async function addGroupFromModal() {
  const name = window.prompt("새 그룹 이름을 입력하세요.", "새 그룹");
  if (name === null) return;
  const group = name.trim();
  if (!group || favoriteGroups.includes(group)) {
    if (group) setStatus("이미 존재하는 그룹입니다.", true);
    return;
  }
  applyFavoriteSnapshot(CZFavoritesStore.addGroup(favorites, favoriteGroups, group));
  await saveFavorites();
  renderGroupManager();
  renderFavorites();
}

function showModal(kind) {
  const modal = document.getElementById(kind === "items" ? "itemManageModal" : "groupManageModal");
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  if (kind === "items") renderItemManager();
  else renderGroupManager();
}

function closeModal(kind) {
  const modal = document.getElementById(kind === "items" ? "itemManageModal" : "groupManageModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
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

function renderGroupManager() {
  ensureGroups();
  const list = document.getElementById("groupManageList");
  if (!list) return;
  list.innerHTML = favoriteGroups.map((group, i) => `
    <div class="manage-group-row" data-group="${escapeHtml(group)}" draggable="true">
      <span class="manage-drag">⠿</span>
      <span class="manage-index">${i + 1}</span>
      <span class="manage-name">${escapeHtml(group)}</span>
      <button class="manage-rename" type="button">이름 변경</button>
      <button class="manage-remove" type="button" ${group === DEFAULT_GROUP ? "disabled" : ""}>삭제</button>
    </div>`).join("") || '<div class="manage-empty">그룹이 없습니다.</div>';

  list.querySelectorAll(".manage-rename").forEach(btn => btn.addEventListener("click", async () => {
    const row = btn.closest(".manage-group-row");
    const old = row?.dataset.group;
    if (!old) return;
    const nextRaw = window.prompt("그룹 이름을 입력하세요.", old);
    if (nextRaw === null) return;
    const next = nextRaw.trim();
    if (!next || (next !== old && favoriteGroups.includes(next))) return;
    applyFavoriteSnapshot(CZFavoritesStore.renameGroup(favorites, favoriteGroups, old, next));
    await saveFavorites();
    renderGroupManager();
    renderFavorites();
  }));

  list.querySelectorAll(".manage-remove").forEach(btn => btn.addEventListener("click", async () => {
    const group = btn.closest(".manage-group-row")?.dataset.group;
    if (!group || group === DEFAULT_GROUP) return;
    if (!window.confirm(`'${group}' 그룹을 삭제할까요?\n그룹 안의 방송은 기본 그룹으로 이동합니다.`)) return;
    applyFavoriteSnapshot(CZFavoritesStore.deleteGroup(favorites, favoriteGroups, group));
    await saveFavorites();
    renderGroupManager();
    renderFavorites();
  }));

  let dragGroup = null;
  list.querySelectorAll(".manage-group-row").forEach(row => {
    row.addEventListener("dragstart", e => { dragGroup = row.dataset.group; e.dataTransfer.effectAllowed = "move"; });
    row.addEventListener("dragover", e => { if (dragGroup && dragGroup !== row.dataset.group) e.preventDefault(); });
    row.addEventListener("drop", async e => {
      e.preventDefault();
      const target = row.dataset.group;
      if (!dragGroup || !target || dragGroup === target) return;
      list._movedUid = dragGroup;
      list._movedUntil = Date.now() + 650;
      moveGroup(dragGroup, target);
      dragGroup = null;
      await saveFavorites();
      renderGroupManager();
      renderFavorites();
    });
    row.addEventListener("dragend", () => { dragGroup = null; });
  });
  bindFavoriteDragFeedback(list);
}

function renderItemManager() {
  ensureGroups();
  const list = document.getElementById("itemManageList");
  if (!list) return;
  list.innerHTML = favorites.map((fav, i) => `
    <div class="manage-item-row" data-uid="${escapeHtml(fav.uid)}" draggable="true">
      <span class="manage-drag">⠿</span>
      <span class="manage-index">${i + 1}</span>
      <span class="manage-item-name">${escapeHtml(fav.name || fav.title || fav.uid)}</span>
      <select class="manage-item-group">${favoriteGroups.map(g => `<option value="${escapeHtml(g)}" ${g === (fav.group || DEFAULT_GROUP) ? "selected" : ""}>${escapeHtml(g)}</option>`).join("")}</select>
      <button class="manage-item-delete" type="button">삭제</button>
    </div>`).join("") || '<div class="manage-empty">즐겨찾기한 방송이 없습니다.</div>';

  list.querySelectorAll(".manage-item-group").forEach(sel => sel.addEventListener("change", async () => {
    const fav = favorites.find(f => f.uid === sel.closest(".manage-item-row")?.dataset.uid);
    if (!fav) return;
    applyFavoriteSnapshot(CZFavoritesStore.setFavoriteGroup(favorites, favoriteGroups, fav.uid, sel.value));
    await saveFavorites();
    renderItemManager();
    renderFavorites();
  }));

  list.querySelectorAll(".manage-item-delete").forEach(btn => btn.addEventListener("click", async () => {
    const uid = btn.closest(".manage-item-row")?.dataset.uid;
    if (!uid) return;
    applyFavoriteSnapshot(CZFavoritesStore.removeFavorite(favorites, favoriteGroups, uid));
    await saveFavorites();
    renderItemManager();
    renderFavorites();
  }));

  list.querySelectorAll(".manage-item-row").forEach(row => {
    row.addEventListener("dragstart", e => { draggedFavoriteUid = row.dataset.uid; e.dataTransfer.effectAllowed = "move"; });
    row.addEventListener("dragover", e => { if (draggedFavoriteUid && draggedFavoriteUid !== row.dataset.uid) e.preventDefault(); });
    row.addEventListener("drop", async e => {
      e.preventDefault();
      const targetUid = row.dataset.uid;
      if (!draggedFavoriteUid || !targetUid || draggedFavoriteUid === targetUid) return;
      list._movedUid = draggedFavoriteUid;
      list._movedUntil = Date.now() + 650;
      applyFavoriteSnapshot(CZFavoritesStore.moveFavorite(favorites, favoriteGroups, draggedFavoriteUid, targetUid));
      draggedFavoriteUid = null;
      await saveFavorites();
      renderItemManager();
      renderFavorites();
    });
    row.addEventListener("dragend", () => { draggedFavoriteUid = null; });
  });
  bindFavoriteDragFeedback(list);
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
  setStatus("멀티뷰를 여는 중...");
  try {
    const result = await chrome.runtime.sendMessage({
      type: "OPEN_MULTIVIEW_FROM_POPUP",
      initialInputs: multiList.map(x => x.uid)
    });
    if (!result?.ok) { setStatus("CHZZK 페이지를 열지 못했습니다.", true); return; }
    setStatus("멀티뷰를 열었습니다.");
    window.close();
  } catch (err) { setStatus("멀티뷰를 열지 못했습니다.", true); }
}

uidInput.addEventListener("keydown", e => { if (e.key === "Enter") addToList(); });
document.getElementById("addList").addEventListener("click", () => addToList());
document.getElementById("clearList").addEventListener("click", () => { multiList = []; renderList(); });
document.getElementById("groupAddFromModal").addEventListener("click", addGroupFromModal);
document.getElementById("open").addEventListener("click", openMultiView);

// 관리 버튼은 팝업 전체 영역에서 위임 처리하여 동적으로 렌더링되는 UI와도 동일하게 동작하도록 한다.
document.querySelector(".popup").addEventListener("click", async e => {
  const manageGroups = e.target.closest("#manageGroups");
  const manageItems = e.target.closest("#manageItems");
  const refresh = e.target.closest("#refreshFavorites");
  const close = e.target.closest("[data-close-modal]");

  if (manageGroups) { e.preventDefault(); e.stopPropagation(); showModal("groups"); return; }
  if (manageItems) { e.preventDefault(); e.stopPropagation(); showModal("items"); return; }
  if (refresh) {
    e.preventDefault(); e.stopPropagation();
    refresh.disabled = true;
    try {
      await loadFavorites();
      await refreshFavoriteOnlineStatus(true);
      renderFavorites();
    } catch (error) {
      setStatus("온라인 상태 조회에 실패했습니다. 기존 상태를 유지합니다.", true);
    } finally { refresh.disabled = false; }
    return;
  }
  if (close) { e.preventDefault(); e.stopPropagation(); closeModal(close.dataset.closeModal); return; }

  const modal = e.target.closest(".manage-modal");
  if (modal && e.target === modal) {
    closeModal(modal.id === "itemManageModal" ? "items" : "groups");
  }
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
      if (document.getElementById("groupManageModal")?.classList.contains("open") && !document.getElementById("groupManageList")?.dataset.dragging) renderGroupManager();
      if (document.getElementById("itemManageModal")?.classList.contains("open") && !document.getElementById("itemManageList")?.dataset.dragging) renderItemManager();
    } catch (err) { console.warn("즐겨찾기 동기화 실패", err); }
  });
});
loadFavorites({refreshOnline: true}).catch(err => setStatus(String(err), true));
