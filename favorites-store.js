// Shared favorites data and storage adapter for popup and CHZZK page.
// Read operations never write back: opening another view must not overwrite groups.
// The scripting fallback may inject this file after declarative injection.
// Keep the same adapter when it is loaded again in an existing view.
globalThis.CZFavoritesStore = globalThis.CZFavoritesStore || (() => {
  const FAVORITES_KEY = "chzzkMultiviewFavoritesV08";
  const FAVORITES_LEGACY_KEY = "chzzkMultiviewFavoritesV07";
  const GROUPS_KEY = "chzzkMultiviewFavoriteGroupsV02";
  const GROUPS_LEGACY_KEY = "chzzkMultiviewFavoriteGroupsV01";
  const DEFAULT_GROUP = "기본 그룹";
  const keys = [FAVORITES_KEY, FAVORITES_LEGACY_KEY, GROUPS_KEY, GROUPS_LEGACY_KEY];
  const cleanGroup = g => String(g || "").trim();
  const normalizeFavorite = f => ({
    ...f, uid: String(f.uid).trim(),
    name: String(f.name || f.title || f.uid).replace(/\s*-\s*CHZZK\s*$/i, '').trim(),
    title: String(f.title || f.name || f.uid).replace(/\s*-\s*CHZZK\s*$/i, '').trim(),
    group: cleanGroup(f.group) || DEFAULT_GROUP,
    online: f.online === true,
    openAt: Number(f.openAt) > 0 ? Number(f.openAt) : null,
    category: String(f.category || '').trim(),
    order: Number.isFinite(Number(f.order)) && Number(f.order) > 0 ? Number(f.order) : null
  });
  const normalize = data => {
    const fs = Array.isArray(data?.[FAVORITES_KEY]) ? data[FAVORITES_KEY] :
      (Array.isArray(data?.[FAVORITES_LEGACY_KEY]) ? data[FAVORITES_LEGACY_KEY] : []);
    const gs = Array.isArray(data?.[GROUPS_KEY]) ? data[GROUPS_KEY] :
      (Array.isArray(data?.[GROUPS_LEGACY_KEY]) ? data[GROUPS_LEGACY_KEY] : []);
    const favorites = fs.filter(f => f && f.uid).map(normalizeFavorite);
    favorites.sort((a,b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
    favorites.forEach((f,i) => { f.order = i+1; });
    const groups = [...new Set([...(gs || []).map(cleanGroup).filter(Boolean), DEFAULT_GROUP,
      ...favorites.map(f => f.group)])];
    return {favorites, groups};
  };
  function snapshot(favorites, groups) {
    return normalize({[FAVORITES_KEY]: favorites, [GROUPS_KEY]: groups});
  }
  // Pure transformations: retain global order when only group membership changes.
  function addGroup(favorites, groups, name) {
    const state = snapshot(favorites, groups);
    const group = cleanGroup(name);
    if (group && !state.groups.includes(group)) state.groups.push(group);
    return state;
  }
  function renameGroup(favorites, groups, old, name) {
    const state = snapshot(favorites, groups);
    const group = cleanGroup(name);
    if (!state.groups.includes(old) || !group || (group !== old && state.groups.includes(group))) return state;
    state.groups = state.groups.map(g => g === old ? group : g);
    state.favorites.forEach(f => { if (f.group === old) f.group = group; });
    return snapshot(state.favorites, state.groups);
  }
  function deleteGroup(favorites, groups, group) {
    const state = snapshot(favorites, groups);
    if (group === DEFAULT_GROUP) return state;
    state.groups = state.groups.filter(g => g !== group);
    state.favorites.forEach(f => { if (f.group === group) f.group = DEFAULT_GROUP; });
    return state;
  }
  function moveGroup(favorites, groups, group, target) {
    const state = snapshot(favorites, groups);
    if (group === target || !state.groups.includes(group) || !state.groups.includes(target)) return state;
    state.groups.splice(state.groups.indexOf(group), 1);
    state.groups.splice(state.groups.indexOf(target), 0, group);
    return state;
  }
  function setFavoriteGroup(favorites, groups, uid, group) {
    const state = snapshot(favorites, groups);
    const favorite = state.favorites.find(f => f.uid === uid);
    if (favorite) favorite.group = cleanGroup(group) || DEFAULT_GROUP;
    return snapshot(state.favorites, state.groups);
  }
  function removeFavorite(favorites, groups, uid) {
    return snapshot(favorites.filter(f => f.uid !== uid), groups);
  }
  function moveFavorite(favorites, groups, uid, target) {
    const state = snapshot(favorites, groups);
    const from = state.favorites.findIndex(f => f.uid === uid);
    const to = state.favorites.findIndex(f => f.uid === target);
    if (from < 0 || to < 0 || from === to) return state;
    const [moved] = state.favorites.splice(from, 1);
    state.favorites.splice(to, 0, moved);
    state.favorites.forEach((f, i) => { f.order = i + 1; });
    return state;
  }
  function itemsForGroup(favorites, group) {
    return favorites.filter(f => (f.group || DEFAULT_GROUP) === group).sort((a, b) =>
      Number(b.online === true) - Number(a.online === true) || (Number(a.order) || 0) - (Number(b.order) || 0));
  }
  // CHZZK openDate is a KST wall-clock value, independent of the browser timezone.
  function parseOpenDate(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +m[6]);
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  function favoriteMetaText(fav, now = Date.now()) {
    if (!fav?.online) return '';
    const minutes = Math.floor(Math.max(0, now - fav.openAt) / 60000);
    const h = Math.floor(minutes / 60), m = minutes % 60;
    const duration = fav.openAt ? (h > 0 ? `${h}시간 ${m}분` : `${m}분`) : '';
    return [fav.category, duration].filter(Boolean).join(' · ');
  }
  async function fetchLiveInfo(uid, { throwOnError = false } = {}) {
    const offline = {online: false, openAt: null, category: ''};
    try {
      const response = await fetch(`https://api.chzzk.naver.com/service/v3.3/channels/${encodeURIComponent(uid)}/live-detail`, {
        credentials: 'include',
        headers: {Accept: 'application/json, text/plain, */*', 'Front-Client-Platform-Type': 'PC', 'Front-Client-Product-Type': 'web'}
      });
      if (!response.ok) {
        if (throwOnError) throw new Error(`방송 상태 조회 HTTP ${response.status}`);
        return offline;
      }
      const data = await response.json(), content = data?.content;
      if (!(data?.code === 200 && content?.status === 'OPEN')) return offline;
      return {online: true, openAt: parseOpenDate(content.openDate), category: String(content.liveCategoryValue || content.liveCategory || '').trim()};
    } catch (error) {
      if (throwOnError) throw error;
      return offline;
    }
  }
  async function fetchChannelName(uid) {
    // Channel details remain available when the broadcaster is offline.
    for (const endpoint of [`service/v1/channels/${encodeURIComponent(uid)}`, `service/v3.3/channels/${encodeURIComponent(uid)}/live-detail`]) {
      try {
        const response = await fetch(`https://api.chzzk.naver.com/${endpoint}`, {
          credentials: 'include',
          headers: {Accept: 'application/json, text/plain, */*', 'Front-Client-Platform-Type': 'PC', 'Front-Client-Product-Type': 'web'}
        });
        if (!response.ok) continue;
        const data = await response.json();
        if (data.code !== 200) continue;
        const name = data.content?.channel?.channelName || data.content?.channelName;
        if (name) return String(name).trim();
      } catch (_) {}
    }
    return null;
  }
  function mergeInfo(favorites, updates) {
    return favorites.map(f => {
      const info = updates[f.uid];
      if (!info) return {...f};
      // Metadata updates must never change membership, group or global order.
      const next = {...f};
      for (const key of ['online', 'openAt', 'category', 'name', 'title']) {
        if (Object.hasOwn(info, key)) next[key] = info[key];
      }
      return next;
    });
  }
  let infoWriteQueue = Promise.resolve();
  function writeInfo(updates) {
    // Several streamer-name requests can finish together in the same view.
    const task = infoWriteQueue.catch(() => {}).then(async () => {
      const latest = await read();
      return write(mergeInfo(latest.favorites, updates), latest.groups);
    });
    infoWriteQueue = task;
    return task;
  }
  async function read() { return normalize(await chrome.storage.local.get(keys)); }
  async function write(favorites, groups) {
    const payload = snapshot(favorites, groups);
    await chrome.storage.local.set({[FAVORITES_KEY]: payload.favorites, [GROUPS_KEY]: payload.groups});
    return payload;
  }
  function subscribe(callback) {
    const handler = (changes, area) => {
      if (area === 'local' && (changes[FAVORITES_KEY] || changes[GROUPS_KEY])) callback();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
  return Object.freeze({read, write, subscribe, snapshot, addGroup, renameGroup, deleteGroup,
    moveGroup, setFavoriteGroup, removeFavorite, moveFavorite, itemsForGroup,
    parseOpenDate, favoriteMetaText, fetchLiveInfo, fetchChannelName, mergeInfo, writeInfo,
    FAVORITES_KEY, GROUPS_KEY, DEFAULT_GROUP});
})();
