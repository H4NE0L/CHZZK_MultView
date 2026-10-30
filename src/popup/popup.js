"use strict";
(() => {
  // src/shared/favorite-item.js
  var escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  function favoriteDetails(favorite) {
    const name = escape(favorite.name || favorite.title || favorite.uid);
    if (!favorite.online) return `<span class="favorite-details favorite-offline"><span class="favorite-primary"><span class="favorite-name favorite-list-name" title="${name}">${name}</span><span class="favorite-offline-label">오프라인</span></span></span>`;
    const title = escape(favorite.online ? favorite.liveTitle || "방송 제목 확인 중" : "방송 종료");
    const category = escape(favorite.online ? favorite.category || "카테고리 없음" : "오프라인");
    const duration = escape(CZFavoritesStore.favoriteDuration(favorite));
    return `<span class="favorite-details"><span class="favorite-primary"><span class="favorite-name favorite-list-name" title="${name}">${name}</span><span class="favorite-title" title="${title}">${title}</span></span><span class="favorite-secondary"><span class="favorite-category favorite-list-category" title="${category}">${category}</span><span class="favorite-meta favorite-list-meta" title="방송 시간 (hh:mm:ss)">${duration}</span></span></span>`;
  }

  // src/popup/popup.js
  var statusEl = document.getElementById("status");
  var uidInput = document.getElementById("uidInput");
  var favoritesEl = document.getElementById("favorites");
  var multiListEl = document.getElementById("multiList");
  var versionEl = document.getElementById("version");
  var favorites = [];
  var favoriteGroups = [];
  var multiList = [];
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
  var favoriteDuration = CZFavoritesStore.favoriteDuration;
  function applyFavoriteSnapshot(snapshot) {
    favorites = snapshot.favorites;
    favoriteGroups = snapshot.groups;
  }
  function ensureGroups() {
    applyFavoriteSnapshot(CZFavoritesStore.snapshot(favorites, favoriteGroups));
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[ch]);
  }
  function getGroupItems(group) {
    return CZFavoritesStore.itemsForGroup(favorites, group);
  }
  function renderFavorites() {
    ensureGroups();
    const groups = [...favoriteGroups, ...getGroupItems("").length ? [""] : []];
    favoritesEl.innerHTML = groups.map((group) => {
      const allItems = getGroupItems(group);
      const items = CZGroupManager.visibleItems(group, allItems);
      return `<details class="favorite-group" open data-group="${escapeHtml(group)}">
      <summary class="favorite-group-summary">
        <span class="group-name">${escapeHtml(group || "그룹 없음")}</span>
        <span class="favorite-group-count">(${allItems.length})</span>
        ${items.some((f) => f.online) ? `<button class="group-open-online" type="button" data-group="${escapeHtml(group)}">온라인 ${items.filter((f) => f.online).length}개 멀티뷰</button>` : ""}
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
      ${favoriteDetails(fav)}
      ${fav.online ? '<span class="online-badge">ONLINE</span>' : '<span class="offline-badge">OFFLINE</span>'}
    </button>
  </div>`;
  }
  function bindFavoriteEvents() {
    favoritesEl.querySelectorAll(".favorite-main").forEach((btn) => btn.addEventListener("click", () => {
      const uid = btn.closest(".favorite-row")?.dataset.uid;
      if (uid) addToList(uid);
    }));
    favoritesEl.querySelectorAll(".group-open-online").forEach((btn) => btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      getGroupItems(btn.dataset.group).filter((f) => f.online).forEach((f) => addToList(f.uid));
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
      const row = document.createElement("div");
      row.className = "multi-row";
      const text = document.createElement("div");
      text.className = "multi-row-text";
      text.textContent = `${item.name || item.title || item.uid}  ${item.uid}`;
      const del = document.createElement("button");
      del.className = "row-del";
      del.textContent = "✕";
      del.onclick = () => {
        multiList.splice(i, 1);
        renderList();
      };
      row.append(text, del);
      multiListEl.appendChild(row);
    });
  }
  async function loadFavorites({ refreshOnline = false } = {}) {
    const snapshot = await CZFavoritesStore.read();
    favorites = snapshot.favorites;
    favoriteGroups = snapshot.groups;
    if (refreshOnline) await refreshFavoriteOnlineStatus(false);
    renderFavorites();
    renderList();
  }
  var fetchLiveInfo = CZChzzkApi.fetchFavoriteInfo;
  var favoriteRefreshInFlight = null;
  function refreshFavoriteOnlineStatus(...args) {
    if (favoriteRefreshInFlight) return favoriteRefreshInFlight;
    favoriteRefreshInFlight = performFavoriteOnlineRefresh(...args).finally(() => {
      favoriteRefreshInFlight = null;
    });
    return favoriteRefreshInFlight;
  }
  async function performFavoriteOnlineRefresh(showStatus = true, { persist = showStatus } = {}) {
    if (!favorites.length) return;
    if (showStatus) setStatus("즐겨찾기 온라인 상태를 확인하는 중...");
    const uids = favorites.map((f) => f.uid);
    const results = await CZChzzkApi.parallelMap(uids, (uid) => fetchLiveInfo(uid, { throwOnError: true }));
    const updates = Object.fromEntries(uids.map((uid, i) => [uid, results[i]]));
    if (persist) applyFavoriteSnapshot(await CZFavoritesStore.writeInfo(updates));
    else favorites = CZFavoritesStore.mergeInfo(favorites, updates);
    if (showStatus) setStatus("즐겨찾기 온라인 상태를 갱신했습니다.");
  }
  function addToList(value = uidInput.value) {
    const uid = uidFromInput(value);
    if (!uid) {
      setStatus("올바른 방송 URL 또는 UID를 입력해주세요.", true);
      uidInput.focus();
      return false;
    }
    if (!multiList.some((x) => x.uid === uid)) {
      const fav = favorites.find((f) => f.uid === uid);
      multiList.push({ uid, name: fav?.name || fav?.title || "" });
    }
    renderList();
    if (value === uidInput.value) {
      uidInput.value = "";
      uidInput.focus();
    }
    return true;
  }
  async function openMultiView(target = "window") {
    const destination = target === "tab" ? "새 탭" : "새 창";
    const current = uidFromInput(uidInput.value);
    if (uidInput.value.trim() && !current) {
      setStatus("올바른 방송 URL 또는 UID를 입력해주세요.", true);
      return;
    }
    if (current) addToList(uidInput.value);
    setStatus(`${destination}에 멀티뷰를 여는 중...`);
    try {
      const result = await chrome.runtime.sendMessage({
        type: "OPEN_MULTIVIEW_FROM_POPUP",
        target,
        initialInputs: multiList.map((x) => x.uid.startsWith("video:") ? `video/${x.uid.slice(6)}` : x.uid)
      });
      if (!result?.ok) {
        setStatus("멀티뷰 페이지를 열지 못했습니다.", true);
        return;
      }
      setStatus(`${destination}에 멀티뷰를 열었습니다.`);
      window.close();
    } catch (err) {
      setStatus("멀티뷰를 열지 못했습니다.", true);
    }
  }
  uidInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addToList();
  });
  document.getElementById("addList").addEventListener("click", () => addToList());
  document.getElementById("clearList").addEventListener("click", () => {
    multiList = [];
    renderList();
  });
  document.getElementById("open").addEventListener("click", () => openMultiView("window"));
  document.getElementById("openTab").addEventListener("click", () => openMultiView("tab"));
  document.getElementById("manageGroups").addEventListener("click", () => groupManager.open().catch((error) => setStatus(error.message, true)));
  document.getElementById("refreshFavorites").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await loadFavorites();
      await refreshFavoriteOnlineStatus(true);
      renderFavorites();
    } catch (error) {
      setStatus("온라인 상태 조회에 실패했습니다. 기존 상태를 유지합니다.", true);
    } finally {
      document.getElementById("refreshFavorites").disabled = false;
    }
  });
  var groupManager = CZGroupManager.attach({
    root: document,
    onSaved: (snapshot) => {
      applyFavoriteSnapshot(snapshot);
      renderFavorites();
      renderList();
    },
    onAdd: (channel) => addToList(channel.uid)
  });
  setInterval(() => {
    favoritesEl.querySelectorAll(".favorite-row").forEach((row) => {
      const fav = favorites.find((f) => f.uid === row.dataset.uid);
      const meta = row.querySelector(".favorite-meta");
      if (fav && meta) meta.textContent = favoriteDuration(fav);
    });
  }, 1e3);
  setInterval(async () => {
    if (favoriteRefreshInFlight || document.querySelector('[data-dragging="true"]')) return;
    try {
      await refreshFavoriteOnlineStatus(false, { persist: true });
      renderFavorites();
    } catch (error) {
      console.warn("즐겨찾기 자동 상태 조회 실패:", error);
    }
  }, 3e4);
  renderVersion();
  var favoritesReloadPending = false;
  CZFavoritesStore.subscribe(() => {
    if (favoritesReloadPending) return;
    favoritesReloadPending = true;
    queueMicrotask(async () => {
      favoritesReloadPending = false;
      try {
        await loadFavorites();
        groupManager.sync();
      } catch (err) {
        console.warn("즐겨찾기 동기화 실패", err);
      }
    });
  });
  loadFavorites({ refreshOnline: true }).catch((err) => setStatus(String(err), true));
  document.getElementById("settingsBackupBtn").onclick = () => chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_BACKUP" }).catch((error) => setStatus(error.message, true));
})();
