"use strict";
(() => {
  // src/shared/favorites-store.js
  globalThis.CZFavoritesStore = globalThis.CZFavoritesStore || (() => {
    const FAVORITES_KEY = "chzzkMultiviewFavoritesV08";
    const FAVORITES_LEGACY_KEY = "chzzkMultiviewFavoritesV07";
    const GROUPS_KEY = "chzzkMultiviewFavoriteGroupsV02";
    const GROUPS_LEGACY_KEY = "chzzkMultiviewFavoriteGroupsV01";
    const DEFAULT_GROUP = "기본 그룹";
    const keys = [FAVORITES_KEY, FAVORITES_LEGACY_KEY, GROUPS_KEY, GROUPS_LEGACY_KEY];
    const GROUP_OPTIONS_KEY = "chzzkFavoriteGroupOptionsV2";
    const cleanGroup = (g) => String(g || "").trim();
    function memberships(favorite) {
      const groups = [...new Set((Array.isArray(favorite.groups) ? favorite.groups : [favorite.group || DEFAULT_GROUP]).map(cleanGroup).filter(Boolean))];
      return groups;
    }
    const normalizeFavorite = (f) => ({
      ...f,
      uid: String(f.uid).trim(),
      name: String(f.name || f.title || f.uid).replace(/\s*-\s*CHZZK\s*$/i, "").trim(),
      title: String(f.title || f.name || f.uid).replace(/\s*-\s*CHZZK\s*$/i, "").trim(),
      group: memberships(f)[0] || "",
      groups: memberships(f),
      online: f.online === true,
      openAt: Number(f.openAt) > 0 ? Number(f.openAt) : null,
      category: String(f.category || "").trim(),
      viewerCount: normalizeViewerCount(f.viewerCount),
      order: Number.isFinite(Number(f.order)) && Number(f.order) > 0 ? Number(f.order) : null
    });
    const normalize = (data) => {
      const fs = Array.isArray(data?.[FAVORITES_KEY]) ? data[FAVORITES_KEY] : Array.isArray(data?.[FAVORITES_LEGACY_KEY]) ? data[FAVORITES_LEGACY_KEY] : [];
      const gs = Array.isArray(data?.[GROUPS_KEY]) ? data[GROUPS_KEY] : Array.isArray(data?.[GROUPS_LEGACY_KEY]) ? data[GROUPS_LEGACY_KEY] : [];
      const favorites = fs.filter((f) => f && f.uid).map(normalizeFavorite);
      favorites.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
      favorites.forEach((f, i) => {
        f.order = i + 1;
      });
      const groups = [.../* @__PURE__ */ new Set([
        ...(gs || []).map(cleanGroup).filter(Boolean),
        ...favorites.flatMap((f) => f.groups)
      ])];
      return { favorites, groups };
    };
    function snapshot(favorites, groups) {
      return normalize({ [FAVORITES_KEY]: favorites, [GROUPS_KEY]: groups });
    }
    function addGroup(favorites, groups, name) {
      const state = snapshot(favorites, groups);
      const group = cleanGroup(name);
      if (group && !state.groups.includes(group)) state.groups.push(group);
      return state;
    }
    function renameGroup(favorites, groups, old, name) {
      const state = snapshot(favorites, groups);
      const group = cleanGroup(name);
      if (!state.groups.includes(old) || !group || group !== old && state.groups.includes(group)) return state;
      state.groups = state.groups.map((g) => g === old ? group : g);
      state.favorites.forEach((f) => {
        if (f.group === old) f.group = group;
        f.groups = f.groups.map((g) => g === old ? group : g);
      });
      return snapshot(state.favorites, state.groups);
    }
    function deleteGroup(favorites, groups, group) {
      const state = snapshot(favorites, groups);
      state.groups = state.groups.filter((g) => g !== group);
      state.favorites.forEach((f) => {
        f.groups = f.groups.filter((g) => g !== group);
        f.group = f.groups[0] || "";
      });
      return snapshot(state.favorites, state.groups);
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
      const favorite = state.favorites.find((f) => f.uid === uid);
      if (favorite) {
        favorite.group = cleanGroup(group);
        favorite.groups = favorite.group ? [favorite.group] : [];
      }
      return snapshot(state.favorites, state.groups);
    }
    function setGroupMembers(favorites, groups, oldName, name, channels) {
      const group = cleanGroup(name);
      if (!group) throw Error("그룹 이름을 입력해주세요.");
      if (groups.includes(group) && group !== oldName) throw Error("이미 존재하는 그룹 이름입니다.");
      let state = oldName ? renameGroup(favorites, groups, oldName, group) : addGroup(favorites, groups, group);
      const selected = new Map(channels.map((c) => [c.uid, c]));
      for (const favorite of state.favorites) {
        if (!selected.has(favorite.uid)) favorite.groups = favorite.groups.filter((g) => g !== group);
        else if (!favorite.groups.includes(group)) favorite.groups.push(group);
        favorite.group = favorite.groups[0] || "";
        selected.delete(favorite.uid);
      }
      for (const channel of selected.values()) state.favorites.push({ ...channel, group, groups: [group], order: state.favorites.length + 1 });
      return snapshot(state.favorites, state.groups);
    }
    function shiftGroup(favorites, groups, group, direction) {
      const state = snapshot(favorites, groups);
      const index = state.groups.indexOf(group), next = index + direction;
      if (index < 0 || next < 0 || next >= state.groups.length) return state;
      [state.groups[index], state.groups[next]] = [state.groups[next], state.groups[index]];
      return state;
    }
    function removeFavorite(favorites, groups, uid) {
      return snapshot(favorites.filter((f) => f.uid !== uid), groups);
    }
    function moveFavorite(favorites, groups, uid, target) {
      const state = snapshot(favorites, groups);
      const from = state.favorites.findIndex((f) => f.uid === uid);
      const to = state.favorites.findIndex((f) => f.uid === target);
      if (from < 0 || to < 0 || from === to) return state;
      const [moved] = state.favorites.splice(from, 1);
      state.favorites.splice(to, 0, moved);
      state.favorites.forEach((f, i) => {
        f.order = i + 1;
      });
      return state;
    }
    function itemsForGroup(favorites, group) {
      return favorites.filter((f) => group ? memberships(f).includes(group) : memberships(f).length === 0).sort((a, b) => Number(b.online === true) - Number(a.online === true) || (Number(a.order) || 0) - (Number(b.order) || 0));
    }
    const { parseOpenDate, normalizeViewerCount, favoriteDuration, favoriteMetaText, favoriteViewerText, fetchLiveInfo, fetchChannelName } = CZChzzkApi;
    function mergeInfo(favorites, updates) {
      return favorites.map((f) => {
        const info = updates[f.uid];
        if (!info) return { ...f };
        const next = { ...f };
        for (const key of ["online", "openAt", "category", "viewerCount", "name", "title"]) {
          if (Object.hasOwn(info, key)) next[key] = info[key];
        }
        return next;
      });
    }
    let infoWriteQueue = Promise.resolve();
    function writeInfo(updates) {
      const task = infoWriteQueue.catch(() => {
      }).then(async () => {
        const latest = await read();
        return write(mergeInfo(latest.favorites, updates), latest.groups);
      });
      infoWriteQueue = task;
      return task;
    }
    async function read() {
      return normalize(await chrome.storage.local.get(keys));
    }
    async function write(favorites, groups, groupOptions) {
      const payload = snapshot(favorites, groups);
      await chrome.storage.local.set({ [FAVORITES_KEY]: payload.favorites, [GROUPS_KEY]: payload.groups, ...groupOptions ? { [GROUP_OPTIONS_KEY]: groupOptions } : {} });
      return payload;
    }
    function subscribe(callback) {
      const handler = (changes, area) => {
        if (area === "local" && (changes[FAVORITES_KEY] || changes[GROUPS_KEY])) callback();
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    }
    return Object.freeze({
      read,
      write,
      subscribe,
      snapshot,
      addGroup,
      renameGroup,
      deleteGroup,
      moveGroup,
      shiftGroup,
      setGroupMembers,
      setFavoriteGroup,
      removeFavorite,
      moveFavorite,
      itemsForGroup,
      parseOpenDate,
      favoriteMetaText,
      favoriteDuration,
      favoriteViewerText,
      fetchLiveInfo,
      fetchChannelName,
      mergeInfo,
      writeInfo,
      FAVORITES_KEY,
      GROUPS_KEY,
      GROUP_OPTIONS_KEY,
      DEFAULT_GROUP
    });
  })();
})();
