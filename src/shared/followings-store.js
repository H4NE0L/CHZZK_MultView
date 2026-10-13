globalThis.CZFollowings = (() => {
  const KEY = 'chzzkFollowingCacheV2';
  let pending = null;
  async function read() { const saved = (await chrome.storage.local.get(KEY))[KEY]; return Array.isArray(saved?.channels) ? saved : {channels: [], updatedAt: null}; }
  function refresh() {
    if (pending) return pending;
    pending = (async () => {
      const old = await read();
      const channels = await CZChzzkApi.fetchFollowings(old.channels);
      const result = {channels, updatedAt: Date.now()};
      await chrome.storage.local.set({[KEY]: result});
      return result;
    })().finally(() => {pending = null;});
    return pending;
  }
  return {KEY, read, refresh};
})();
