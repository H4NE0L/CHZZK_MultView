const FAVORITES_KEY = "chzzkMultiviewFavoritesV08";
const FAVORITES_LEGACY_KEY = "chzzkMultiviewFavoritesV07";
const FAVORITE_GROUPS_KEY = "chzzkMultiviewFavoriteGroupsV02";
const FAVORITE_GROUPS_LEGACY_KEY = "chzzkMultiviewFavoriteGroupsV01";
const DEFAULT_GROUP = "기본 그룹";

const statusEl = document.getElementById("status");
const uidInput = document.getElementById("uidInput");
const favoritesEl = document.getElementById("favorites");
const multiListEl = document.getElementById("multiList");
const versionEl = document.getElementById("version");
let favorites = [];
let favoriteGroups = [DEFAULT_GROUP];
let multiList = [];
let selectedFavoriteUid = "";
let draggedGroup = null;
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

function normalizeFavorite(fav) {
  const uid = String(fav?.uid || "").trim();
  if (!uid) return null;
  return {
    ...fav,
    uid,
    name: String(fav?.name || fav?.title || uid).replace(/\s*-\s*CHZZK\s*$/i, "").trim() || uid,
    title: String(fav?.title || fav?.name || uid).replace(/\s*-\s*CHZZK\s*$/i, "").trim() || uid,
    group: String(fav?.group || DEFAULT_GROUP).trim() || DEFAULT_GROUP,
    online: fav?.online === true
  };
}

function ensureGroups() {
  const set = new Set(favoriteGroups.filter(Boolean));
  set.add(DEFAULT_GROUP);
  for (const fav of favorites) set.add(fav.group || DEFAULT_GROUP);
  favoriteGroups = [...set];
}

function normalizeFavoriteOrders() {
  const sorted = [...favorites].sort((a, b) => {
    const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
    return ao - bo;
  });
  sorted.forEach((fav, i) => { fav.order = i + 1; });
  favorites = sorted;
}

function reindexFavoriteOrders() {
  favorites.forEach((fav, i) => { fav.order = i + 1; });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
}

function getGroupItems(group) {
  const items = favorites.filter(f => (f.group || DEFAULT_GROUP) === group);
  // 온라인 여부를 최우선으로 하되, 같은 상태에서는 전역 순서를 유지한다.
  return items.sort((a, b) => Number(b.online === true) - Number(a.online === true) || (Number(a.order) || 0) - (Number(b.order) || 0));
}

function renderFavorites() {
  ensureGroups();
  const groups = favoriteGroups;

  if (!favorites.length) {
    favoritesEl.innerHTML = `<div class="favorite-empty">즐겨찾기한 방송이 없습니다.</div>`;
    return;
  }

  favoritesEl.innerHTML = groups.map(group => {
    const items = getGroupItems(group);
    if (!items.length) return `<div class="favorite-group-empty" data-group="${escapeHtml(group)}">${escapeHtml(group)} <span>비어 있음</span></div>`;
    return `<details class="favorite-group" open data-group="${escapeHtml(group)}">
      <summary class="favorite-group-summary">
        <span class="group-name">${escapeHtml(group)}</span>
        <span class="favorite-group-count">${items.length}</span>
        ${items.some(f => f.online) ? `<button class="group-open-online" type="button" data-group="${escapeHtml(group)}">온라인 ${items.filter(f=>f.online).length}개 멀티뷰</button>` : ''}
      </summary>
      <div class="favorite-group-items">${items.map(renderFavoriteRow).join("")}</div>
    </details>`;
  }).join("");

  bindFavoriteEvents();
}

function renderFavoriteRow(fav) {
  return `<div class="favorite-row ${fav.online ? "online" : ""}" data-uid="${escapeHtml(fav.uid)}">
    <button class="favorite-main" title="멀티뷰 목록에 추가">
      <span class="favorite-status ${fav.online ? "online" : ""}"></span>
      <span class="favorite-name">${escapeHtml(fav.name || fav.title || fav.uid)}</span>
      ${fav.online ? '<span class="online-badge">ONLINE</span>' : '<span class="offline-badge">OFFLINE</span>'}
    </button>
  </div>`;
}

function moveGroup(group, targetGroup) {
  if (!group || !targetGroup || group === targetGroup) return;
  const from = favoriteGroups.indexOf(group);
  const to = favoriteGroups.indexOf(targetGroup);
  if (from < 0 || to < 0) return;
  favoriteGroups.splice(from, 1);
  favoriteGroups.splice(favoriteGroups.indexOf(targetGroup), 0, group);
}

function moveFavoriteWithinGroup(uid, targetUid) {
  if (!uid || !targetUid || uid === targetUid) return;
  const source = favorites.find(f => f.uid === uid);
  const target = favorites.find(f => f.uid === targetUid);
  if (!source || !target || (source.group || DEFAULT_GROUP) !== (target.group || DEFAULT_GROUP)) return;

  const group = source.group || DEFAULT_GROUP;
  const groupItems = favorites.filter(f => (f.group || DEFAULT_GROUP) === group);
  const sourceIndex = groupItems.findIndex(f => f.uid === uid);
  const targetIndex = groupItems.findIndex(f => f.uid === targetUid);
  if (sourceIndex < 0 || targetIndex < 0) return;

  groupItems.splice(sourceIndex, 1);
  groupItems.splice(targetIndex, 0, source);

  let cursor = 0;
  favorites = favorites.map(f => {
    if ((f.group || DEFAULT_GROUP) !== group) return f;
    return groupItems[cursor++];
  });
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

async function loadFavorites() {
  const r = await chrome.storage.local.get([
    FAVORITES_KEY, FAVORITES_LEGACY_KEY,
    FAVORITE_GROUPS_KEY, FAVORITE_GROUPS_LEGACY_KEY
  ]);

  const rawFavorites = Array.isArray(r[FAVORITES_KEY]) ? r[FAVORITES_KEY]
    : (Array.isArray(r[FAVORITES_LEGACY_KEY]) ? r[FAVORITES_LEGACY_KEY] : []);
  const rawGroups = Array.isArray(r[FAVORITE_GROUPS_KEY]) ? r[FAVORITE_GROUPS_KEY]
    : (Array.isArray(r[FAVORITE_GROUPS_LEGACY_KEY]) ? r[FAVORITE_GROUPS_LEGACY_KEY] : [DEFAULT_GROUP]);

  favorites = rawFavorites.map(normalizeFavorite).filter(Boolean);
  favoriteGroups = rawGroups.filter(g => typeof g === "string" && g.trim()).map(g => g.trim());
  ensureGroups();
  normalizeFavoriteOrders();

  // Persist the migrated/normalized data immediately so favorites survive
  // browser/PC restarts and future versions do not depend on the old keys.
  await saveFavorites();
  await refreshFavoriteOnlineStatus(false);
  await saveFavorites();
  renderFavorites();
  renderList();
}

async function saveFavorites() {
  ensureGroups();
  await chrome.storage.local.set({
    [FAVORITES_KEY]: favorites,
    [FAVORITE_GROUPS_KEY]: favoriteGroups
  });
}

async function fetchOnline(uid) {
  try {
    const response = await fetch(`https://api.chzzk.naver.com/service/v3.3/channels/${encodeURIComponent(uid)}/live-detail`, {
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Front-Client-Platform-Type": "PC",
        "Front-Client-Product-Type": "web"
      }
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.code === 200 && data?.content?.status === "OPEN";
  } catch (_) { return false; }
}

async function refreshFavoriteOnlineStatus(showStatus = true) {
  if (!favorites.length) return;
  if (showStatus) setStatus("즐겨찾기 온라인 상태를 확인하는 중...");
  const results = await Promise.all(favorites.map(f => fetchOnline(f.uid)));
  favorites.forEach((f, i) => { f.online = results[i] === true; });
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
  favoriteGroups.push(group);
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
    favoriteGroups = favoriteGroups.map(g => g === old ? next : g);
    favorites.forEach(f => { if ((f.group || DEFAULT_GROUP) === old) f.group = next; });
    await saveFavorites();
    renderGroupManager();
    renderFavorites();
  }));

  list.querySelectorAll(".manage-remove").forEach(btn => btn.addEventListener("click", async () => {
    const group = btn.closest(".manage-group-row")?.dataset.group;
    if (!group || group === DEFAULT_GROUP) return;
    if (!window.confirm(`'${group}' 그룹을 삭제할까요?\n그룹 안의 방송은 기본 그룹으로 이동합니다.`)) return;
    favoriteGroups = favoriteGroups.filter(g => g !== group);
    favorites.forEach(f => { if ((f.group || DEFAULT_GROUP) === group) f.group = DEFAULT_GROUP; });
    ensureGroups();
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
      moveGroup(dragGroup, target);
      dragGroup = null;
      await saveFavorites();
      renderGroupManager();
      renderFavorites();
    });
    row.addEventListener("dragend", () => { dragGroup = null; });
  });
}

function renderItemManager() {
  normalizeFavoriteOrders();
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
    fav.group = sel.value || DEFAULT_GROUP;
    await saveFavorites();
    renderItemManager();
    renderFavorites();
  }));

  list.querySelectorAll(".manage-item-delete").forEach(btn => btn.addEventListener("click", async () => {
    const uid = btn.closest(".manage-item-row")?.dataset.uid;
    if (!uid) return;
    favorites = favorites.filter(f => f.uid !== uid);
    reindexFavoriteOrders();
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
      const from = favorites.findIndex(f => f.uid === draggedFavoriteUid);
      const to = favorites.findIndex(f => f.uid === targetUid);
      if (from < 0 || to < 0) return;
      const [moved] = favorites.splice(from, 1);
      favorites.splice(to, 0, moved);
      reindexFavoriteOrders();
      draggedFavoriteUid = null;
      await saveFavorites();
      renderItemManager();
      renderFavorites();
    });
    row.addEventListener("dragend", () => { draggedFavoriteUid = null; });
  });
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

async function removeFavorite() {
  if (!selectedFavoriteUid) {
    setStatus("삭제할 즐겨찾기를 목록에서 선택해주세요.", true);
    return;
  }
  const fav = favorites.find(f => f.uid === selectedFavoriteUid);
  favorites = favorites.filter(f => f.uid !== selectedFavoriteUid);
  selectedFavoriteUid = "";
  await saveFavorites();
  renderFavorites();
  setStatus(`${fav?.name || "방송"}을(를) 즐겨찾기에서 삭제했습니다.`);
}

async function sendOpenMessage(tabId, initialInputs = [], maxTries = 120) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: "OPEN_MULTIVIEW", initialInputs });
      if (result?.ok !== false) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
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
    await refreshFavoriteOnlineStatus(true);
    renderFavorites();
    return;
  }
  if (close) { e.preventDefault(); e.stopPropagation(); closeModal(close.dataset.closeModal); return; }

  const modal = e.target.closest(".manage-modal");
  if (modal && e.target === modal) {
    closeModal(modal.id === "itemManageModal" ? "items" : "groups");
  }
});

renderVersion();
loadFavorites().catch(err => setStatus(String(err), true));
