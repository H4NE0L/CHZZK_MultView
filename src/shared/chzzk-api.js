globalThis.CZChzzkApi = globalThis.CZChzzkApi || (() => {
  function parseOpenDate(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +m[6]);
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  function normalizeViewerCount(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : null;
  }
  function favoriteViewerText(fav) {
    const count = normalizeViewerCount(fav?.viewerCount);
    return fav?.online && count !== null ? count.toLocaleString('ko-KR') : '--';
  }
  function favoriteDuration(fav, now = Date.now()) {
    if (!fav?.online || !fav.openAt) return '--';
    const seconds = Math.floor(Math.max(0, now - fav.openAt) / 1000);
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, sec = seconds % 60;
    return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
  }
  function favoriteMetaText(fav, now = Date.now()) {
    if (!fav?.online) return '';
    const duration = fav.openAt ? favoriteDuration(fav, now) : '';
    return [fav.category, duration].filter(Boolean).join(' · ');
  }
  async function fetchLiveInfo(uid, { throwOnError = false } = {}) {
    const offline = {online: false, openAt: null, category: '', viewerCount: null};
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
      return {online: true, openAt: parseOpenDate(content.openDate), category: String(content.liveCategoryValue || content.liveCategory || '').trim(), viewerCount: normalizeViewerCount(content.concurrentUserCount)};
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
  return Object.freeze({parseOpenDate, normalizeViewerCount, favoriteDuration, favoriteMetaText, favoriteViewerText, fetchLiveInfo, fetchChannelName});
})();
