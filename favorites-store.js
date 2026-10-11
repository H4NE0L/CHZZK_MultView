// Shared favorites storage adapter for popup and CHZZK page (v1.1.8).
// Read operations never write back: opening another view must not overwrite groups.
const CZFavoritesStore = (() => {
  const FAVORITES_KEY = "chzzkMultiviewFavoritesV08";
  const FAVORITES_LEGACY_KEY = "chzzkMultiviewFavoritesV07";
  const GROUPS_KEY = "chzzkMultiviewFavoriteGroupsV02";
  const GROUPS_LEGACY_KEY = "chzzkMultiviewFavoriteGroupsV01";
  const DEFAULT_GROUP = "기본 그룹";
  const keys = [FAVORITES_KEY, FAVORITES_LEGACY_KEY, GROUPS_KEY, GROUPS_LEGACY_KEY];
  const cleanGroup = g => String(g || "").trim();
  const normalize = data => {
    const fs = Array.isArray(data?.[FAVORITES_KEY]) ? data[FAVORITES_KEY] :
      (Array.isArray(data?.[FAVORITES_LEGACY_KEY]) ? data[FAVORITES_LEGACY_KEY] : []);
    const gs = Array.isArray(data?.[GROUPS_KEY]) ? data[GROUPS_KEY] :
      (Array.isArray(data?.[GROUPS_LEGACY_KEY]) ? data[GROUPS_LEGACY_KEY] : []);
    const favorites = fs.filter(f => f && f.uid).map(f => ({
      ...f, uid: String(f.uid).trim(),
      name: String(f.name || f.title || f.uid).replace(/\s*-\s*CHZZK\s*$/i, '').trim(),
      title: String(f.title || f.name || f.uid).replace(/\s*-\s*CHZZK\s*$/i, '').trim(),
      group: cleanGroup(f.group) || DEFAULT_GROUP,
      online: f.online === true,
      openAt: Number(f.openAt) > 0 ? Number(f.openAt) : null,
      category: String(f.category || '').trim(),
      order: Number.isFinite(Number(f.order)) && Number(f.order) > 0 ? Number(f.order) : null
    }));
    favorites.sort((a,b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
    favorites.forEach((f,i) => { f.order = i+1; });
    const groups = [...new Set([...(gs || []).map(cleanGroup).filter(Boolean), DEFAULT_GROUP,
      ...favorites.map(f => f.group)])];
    return {favorites, groups};
  };
  async function read() { return normalize(await chrome.storage.local.get(keys)); }
  async function write(favorites, groups) {
    const payload = normalize({[FAVORITES_KEY]: favorites, [GROUPS_KEY]: groups});
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
  return Object.freeze({read, write, subscribe, FAVORITES_KEY, GROUPS_KEY, DEFAULT_GROUP});
})();
