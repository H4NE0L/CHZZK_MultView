const FAVORITES_KEY = "chzzkMultiviewFavoritesV07";
const FAVORITE_GROUPS_KEY = "chzzkMultiviewFavoriteGroupsV01";
const DEFAULT_GROUP = "기본 그룹";

const statusEl = document.getElementById("status");
const uidInput = document.getElementById("uidInput");
const favoritesEl = document.getElementById("favorites");
const multiListEl = document.getElementById("multiList");
const groupFilterEl = document.getElementById("groupFilter");
const versionEl = document.getElementById("version");
let favorites = [];
let favoriteGroups = [DEFAULT_GROUP];
let multiList = [];
let selectedFavoriteUid = "";

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

function renderGroupFilter() {
  const current = groupFilterEl.value || "__all__";
  groupFilterEl.innerHTML = `<option value="__all__">전체 그룹</option>` + favoriteGroups.map(g =>
    `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
  groupFilterEl.value = favoriteGroups.includes(current) ? current : "__all__";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
}

function renderFavorites() {
  ensureGroups();
  renderGroupFilter();
  const filter = groupFilterEl.value || "__all__";
  const groups = favoriteGroups.filter(g => filter === "__all__" || g === filter);

  if (!favorites.length) {
    favoritesEl.innerHTML = `<div class="favorite-empty">즐겨찾기한 방송이 없습니다.</div>`;
    return;
  }

  favoritesEl.innerHTML = groups.map(group => {
    const items = favorites
      .filter(f => (f.group || DEFAULT_GROUP) === group)
      .sort((a, b) => Number(b.online === true) - Number(a.online === true));
    if (!items.length) return "";
    return `<details class="favorite-group" open>
      <summary><span>${escapeHtml(group)}</span><span class="favorite-group-count">${items.length}</span></summary>
      <div class="favorite-group-items">${items.map(renderFavoriteRow).join("")}</div>
    </details>`;
  }).join("") || `<div class="favorite-empty">선택한 그룹에 즐겨찾기가 없습니다.</div>`;

  bindFavoriteEvents();
}

function renderFavoriteRow(fav) {
  return `<div class="favorite-row ${fav.online ? "online" : ""}" data-uid="${escapeHtml(fav.uid)}">
    <button class="favorite-main" title="멀티뷰 목록에 추가">
      <span class="favorite-status ${fav.online ? "online" : ""}"></span>
      <span class="favorite-name">${escapeHtml(fav.name || fav.title || fav.uid)}</span>
      ${fav.online ? '<span class="online-badge">ONLINE</span>' : '<span class="offline-badge">OFFLINE</span>'}
    </button>
    <select class="favorite-group-select" title="그룹 변경">
      ${favoriteGroups.map(g => `<option value="${escapeHtml(g)}" ${g === (fav.group || DEFAULT_GROUP) ? "selected" : ""}>${escapeHtml(g)}</option>`).join("")}
    </select>
    <button class="favorite-delete" title="즐겨찾기 삭제">✕</button>
  </div>`;
}

function bindFavoriteEvents() {
  favoritesEl.querySelectorAll(".favorite-main").forEach(btn => {
    btn.addEventListener("click", () => {
      const uid = btn.closest(".favorite-row")?.dataset.uid;
      if (!uid) return;
      selectedFavoriteUid = uid;
      addToList(uid);
    });
  });
  favoritesEl.querySelectorAll(".favorite-group-select").forEach(select => {
    select.addEventListener("change", async () => {
      const uid = select.closest(".favorite-row")?.dataset.uid;
      const fav = favorites.find(f => f.uid === uid);
      if (!fav) return;
      fav.group = select.value || DEFAULT_GROUP;
      ensureGroups();
      await saveFavorites();
      renderFavorites();
      setStatus(`'${fav.name}'을(를) ${fav.group}으로 이동했습니다.`);
    });
  });
  favoritesEl.querySelectorAll(".favorite-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uid = btn.closest(".favorite-row")?.dataset.uid;
      if (!uid) return;
      const fav = favorites.find(f => f.uid === uid);
      favorites = favorites.filter(f => f.uid !== uid);
      if (selectedFavoriteUid === uid) selectedFavoriteUid = "";
      await saveFavorites();
      renderFavorites();
      setStatus(`${fav?.name || uid}을(를) 즐겨찾기에서 삭제했습니다.`);
    });
  });
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
  const r = await chrome.storage.local.get([FAVORITES_KEY, FAVORITE_GROUPS_KEY]);
  favorites = Array.isArray(r[FAVORITES_KEY]) ? r[FAVORITES_KEY].map(normalizeFavorite).filter(Boolean) : [];
  favoriteGroups = Array.isArray(r[FAVORITE_GROUPS_KEY]) ? r[FAVORITE_GROUPS_KEY].filter(g => typeof g === "string" && g.trim()).map(g => g.trim()) : [DEFAULT_GROUP];
  ensureGroups();
  await refreshFavoriteOnlineStatus(false);
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

async function addGroup() {
  const name = window.prompt("새 그룹 이름을 입력하세요.", "새 그룹");
  if (name === null) return;
  const group = name.trim();
  if (!group) return;
  if (favoriteGroups.includes(group)) {
    setStatus("이미 존재하는 그룹입니다.", true);
    return;
  }
  favoriteGroups.push(group);
  await saveFavorites();
  renderFavorites();
  groupFilterEl.value = group;
  renderFavorites();
  setStatus(`'${group}' 그룹을 만들었습니다.`);
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
document.getElementById("removeFavorite").addEventListener("click", removeFavorite);
document.getElementById("addGroup").addEventListener("click", () => addGroup().catch(console.warn));
document.getElementById("refreshFavorites").addEventListener("click", async () => {
  await refreshFavoriteOnlineStatus(true);
  renderFavorites();
});
groupFilterEl.addEventListener("change", renderFavorites);
document.getElementById("open").addEventListener("click", openMultiView);

renderVersion();
loadFavorites().catch(err => setStatus(String(err), true));
