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
        headers: {Accept: 'application/json, text/plain, */*', 'Front-Client-Platform-Type': 'PC', 'Front-Client-Product-Type': 'web'},
        signal: typeof AbortSignal !== 'undefined' ? AbortSignal.timeout(15000) : undefined
      });
      if (!response.ok) {
        if (throwOnError) throw new Error(`방송 상태 조회 HTTP ${response.status}`);
        return offline;
      }
      const data = await response.json(), content = data?.content;
      if (data?.code !== 200 || !['OPEN','CLOSE'].includes(content?.status)) {
        if (throwOnError) throw Error('방송 상태 조회 응답을 확인할 수 없습니다.');
        return offline;
      }
      if (content.status !== 'OPEN') return offline;
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
          headers: {Accept: 'application/json, text/plain, */*', 'Front-Client-Platform-Type': 'PC', 'Front-Client-Product-Type': 'web'},
        signal: typeof AbortSignal !== 'undefined' ? AbortSignal.timeout(15000) : undefined
        });
        if (!response.ok) continue;
        const data = await response.json();
        if (data.code !== 200) continue;
        const channel = data.content?.channel || data.content;
        if (channel?.channelId && channel.channelId !== uid) continue;
        const name = channel?.channelName;
        if (name) return String(name).trim();
      } catch (_) {}
    }
    return null;
  }
  async function request(path) {
    const response = await fetch(`https://api.chzzk.naver.com/${path}`, {
      credentials: 'include',
      headers: {Accept: 'application/json, text/plain, */*', 'Front-Client-Platform-Type': 'PC', 'Front-Client-Product-Type': 'web'},
      signal: typeof AbortSignal !== 'undefined' ? AbortSignal.timeout(15000) : undefined
    });
    if (response.status === 401 || response.status === 403) throw Error('팔로잉 목록을 보려면 Naver 로그인이 필요합니다.');
    if (!response.ok) throw Error(`조회 실패 (HTTP ${response.status})`);
    const data = await response.json();
    if (data.code === 401 || data.code === 403) throw Error('팔로잉 목록을 보려면 Naver 로그인이 필요합니다.');
    if (data.code !== 200 || !data.content) throw Error('조회에 실패했습니다. 잠시 뒤 다시 시도해주세요.');
    return data.content;
  }
  async function fetchVideoChannelName(id) {
    try { const data = await request(`service/v1/videos/${encodeURIComponent(id)}`); return data.channel?.channelName?.trim() || null; } catch (_) { return null; }
  }
  async function fetchFavoriteInfo(uid, options = {}) {
    const [info, name] = await Promise.all([fetchLiveInfo(uid, options), fetchChannelName(uid)]);
    return {...info, ...(name ? {name, title: name} : {})};
  }
  async function parallelMap(items, callback, count = 6) {
    const results = new Array(items.length); let next = 0;
    await Promise.all(Array.from({length: Math.min(count, items.length)}, async () => {
      while (next < items.length) { const index = next++; results[index] = await callback(items[index], index); }
    }));
    return results;
  }
  async function fetchFollowings(previous = []) {
    const channels = new Map();
    for (let page = 0; page < 100; page++) {
      const content = await request(`service/v1/channels/followings?size=50&page=${page}&sortType=FOLLOW`);
      const list = content.followingList;
      if (!Array.isArray(list)) throw Error('팔로잉 목록 응답을 확인할 수 없습니다. 기존 목록을 유지합니다.');
      const before = channels.size;
      for (const item of list) {
        const channel = item.channel;
        if (!channel?.channelId || !channel.channelName?.trim()) continue;
        const uid = String(channel.channelId);
        channels.set(uid, {uid, name: channel.channelName.trim(), title: channel.channelName.trim(), image: channel.channelImageUrl || '',
          tags: (Array.isArray(channel.tags) ? channel.tags : []).filter(t => typeof t === 'string'), openLive: channel.openLive});
      }
      if (list.length && channels.size === before) throw Error('팔로잉 목록의 채널 정보를 확인할 수 없습니다. 기존 목록을 유지합니다.');
      if (list.length === 0 || (Number.isFinite(content.totalCount) && channels.size >= content.totalCount) || list.length < 50 || content.hasNext === false) break;
      if (channels.size === before || page === 99) throw Error('팔로잉 목록 전체를 불러오지 못했습니다. 기존 목록을 유지합니다.');
    }
    const old = new Map(previous.map(f => [f.uid,f]));
    return parallelMap([...channels.values()], async channel => {
      if (channel.openLive === false) return {...channel, online: false, openAt: null, category: '', viewerCount: null};
      try { return {...channel, ...await fetchLiveInfo(channel.uid, {throwOnError: true})}; }
      catch (_) { return {...old.get(channel.uid), ...channel, online: channel.openLive === true || old.get(channel.uid)?.online === true}; }
    });
  }
  return Object.freeze({parseOpenDate, normalizeViewerCount, favoriteDuration, favoriteMetaText, favoriteViewerText, fetchLiveInfo, fetchChannelName, fetchVideoChannelName, fetchFavoriteInfo, fetchFollowings, parallelMap});
})();
