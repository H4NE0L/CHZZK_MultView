const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function fixture(data = {}, fetch = async () => { throw Error('offline'); }) {
  let writes = 0;
  const listeners = new Set();
  const context = vm.createContext({fetch, chrome: {storage: {
    local: {get: async () => structuredClone(data), set: async payload => { Object.assign(data, structuredClone(payload)); writes++; }},
    onChanged: {addListener: f => listeners.add(f), removeListener: f => listeners.delete(f)}
  }}});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../favorites-store.js'), 'utf8'), context);
  return {store: vm.runInContext('CZFavoritesStore', context), data, listeners, writes: () => writes};
}
const plain = value => JSON.parse(JSON.stringify(value));
const favorites = [
  {uid: 'aaaaaa', name: 'A', group: '첫 그룹', order: 1},
  {uid: 'bbbbbb', name: 'B', group: '둘째 그룹', order: 2},
  {uid: 'cccccc', name: 'C', group: '첫 그룹', order: 3}
];
const groups = ['첫 그룹', '둘째 그룹', '기본 그룹', '빈 그룹'];

test('legacy read migrates in memory, keeps empty groups and never writes', async () => {
  const f = fixture({chzzkMultiviewFavoritesV07: [{uid: 'aaaaaa', name: 'A - CHZZK', group: '첫 그룹', order: '2'}], chzzkMultiviewFavoriteGroupsV01: ['빈 그룹']});
  const state = plain(await f.store.read());
  assert.equal(state.favorites[0].name, 'A');
  assert.deepEqual(state.groups, ['빈 그룹', '기본 그룹', '첫 그룹']);
  assert.equal(f.writes(), 0);
});

test('current empty arrays take precedence over legacy data', async () => {
  const f = fixture({chzzkMultiviewFavoritesV08: [], chzzkMultiviewFavoritesV07: favorites});
  assert.deepEqual(plain((await f.store.read()).favorites), []);
});

test('normalization preserves metadata and input while assigning a stable global order', () => {
  const {store} = fixture();
  const source = [{...favorites[0], order: 5, volume: 0.3}, {...favorites[1], order: '1'}, {...favorites[2], order: null}];
  const before = structuredClone(source);
  const state = plain(store.snapshot(source, groups));
  assert.deepEqual(state.favorites.map(f => f.uid), ['bbbbbb', 'aaaaaa', 'cccccc']);
  assert.deepEqual(state.favorites.map(f => f.order), [1,2,3]);
  assert.equal(state.favorites[1].volume, 0.3);
  assert.deepEqual(source, before);
  assert.deepEqual(plain(store.snapshot(state.favorites, state.groups)), state);
});

test('group add, rename, delete and membership changes retain global order', () => {
  const {store} = fixture();
  let state = store.addGroup(favorites, groups, ' 새 그룹 ');
  assert.equal(state.groups.at(-1), '새 그룹');
  state = store.renameGroup(state.favorites, state.groups, '첫 그룹', '변경 그룹');
  assert.equal(state.favorites[0].group, '변경 그룹');
  assert.equal(state.favorites[2].group, '변경 그룹');
  state = store.setFavoriteGroup(state.favorites, state.groups, 'bbbbbb', '변경 그룹');
  state = store.deleteGroup(state.favorites, state.groups, '변경 그룹');
  assert(state.favorites.every(f => f.group === '기본 그룹'));
  assert.deepEqual(plain(state.favorites.map(f => f.uid)), ['aaaaaa','bbbbbb','cccccc']);
  assert.deepEqual(plain(state.favorites.map(f => f.order)), [1,2,3]);
  assert(state.groups.includes('빈 그룹'));
  assert.deepEqual(plain(store.deleteGroup(state.favorites, state.groups, '기본 그룹')), plain(state));
  assert.deepEqual(favorites.map(f => f.group), ['첫 그룹','둘째 그룹','첫 그룹']);
});

test('group operations reject duplicate/empty names and move before the target', () => {
  const {store} = fixture();
  const original = plain(store.snapshot(favorites, groups));
  for (const name of ['', '둘째 그룹']) assert.deepEqual(plain(store.renameGroup(favorites, groups, '첫 그룹', name)), original);
  assert.deepEqual(plain(store.moveGroup(favorites, groups, '첫 그룹', '둘째 그룹')).groups, groups);
  assert.deepEqual(plain(store.moveGroup(favorites, groups, '둘째 그룹', '첫 그룹')).groups, ['둘째 그룹','첫 그룹','기본 그룹','빈 그룹']);
  assert.deepEqual(plain(store.moveGroup(favorites, groups, '첫 그룹', 'missing')), original);
});

test('item drag works in both directions across groups, and deletion reindexes', () => {
  const {store} = fixture();
  let state = store.moveFavorite(favorites, groups, 'aaaaaa', 'cccccc');
  assert.deepEqual(plain(state.favorites.map(f => f.uid)), ['bbbbbb','cccccc','aaaaaa']);
  state = store.moveFavorite(state.favorites, state.groups, 'aaaaaa', 'bbbbbb');
  assert.deepEqual(plain(state.favorites.map(f => f.uid)), ['aaaaaa','bbbbbb','cccccc']);
  state = store.removeFavorite(state.favorites, state.groups, 'bbbbbb');
  assert.deepEqual(plain(state.favorites.map(f => f.order)), [1,2]);
  assert(state.groups.includes('둘째 그룹'));
});

test('online display ordering does not change global order', () => {
  const {store} = fixture();
  const source = [{...favorites[0], online: false}, {...favorites[2], online: true}];
  assert.deepEqual(plain(store.itemsForGroup(source, '첫 그룹').map(f => f.uid)), ['cccccc','aaaaaa']);
  assert.deepEqual(source.map(f => f.uid), ['aaaaaa','cccccc']);
});

test('write/read round trip preserves empty groups and subscriptions filter events', async () => {
  const f = fixture();
  const state = f.store.moveFavorite(favorites, groups, 'aaaaaa', 'cccccc');
  await f.store.write(state.favorites, state.groups);
  assert.deepEqual(plain(await f.store.read()), plain(state));
  assert.equal(f.writes(), 1);
  let calls = 0;
  const unsubscribe = f.store.subscribe(() => calls++);
  const listener = [...f.listeners][0];
  listener({other: {}}, 'local');
  listener({[f.store.FAVORITES_KEY]: {}}, 'sync');
  listener({[f.store.GROUPS_KEY]: {}}, 'local');
  assert.equal(calls, 1);
  unsubscribe();
  assert.equal(f.listeners.size, 0);
});

test('KST timestamps and elapsed-time text match existing behavior', () => {
  const {store} = fixture();
  const start = Date.UTC(2026,9,11,0,0,0);
  assert.equal(store.parseOpenDate('2026-10-11 09:00:00'), start);
  assert.equal(store.parseOpenDate('invalid'), null);
  assert.equal(store.favoriteMetaText({online: true, openAt: start, category: '게임'}, start + 135*60000), '게임 · 02:15:00');
  assert.equal(store.favoriteMetaText({online: false, openAt: start, category: '게임'}, start), '');
  assert.equal(store.favoriteMetaText({online: true, openAt: null, category: '게임'}, start), '게임');
});

test('live-info request retains headers, credentials and category/date extraction', async () => {
  let request;
  const {store} = fixture({}, async (...args) => { request = args; return {ok: true, json: async () => ({code: 200, content: {status: 'OPEN', openDate: '2026-10-11 09:00:00', liveCategoryValue: ' 게임 ', concurrentUserCount: 1234}})}; });
  assert.deepEqual(plain(await store.fetchLiveInfo('a/b')), {online: true, openAt: Date.UTC(2026,9,11), category: '게임', viewerCount: 1234});
  assert(request[0].includes('a%2Fb'));
  assert.equal(request[1].credentials, 'include');
  assert.equal(request[1].headers['Front-Client-Product-Type'], 'web');
});

test('network errors, HTTP errors and closed streams become offline', async () => {
  const responses = [async () => {throw Error('offline');}, async () => ({ok: false}), async () => ({ok: true, json: async () => ({code: 200, content: {status: 'CLOSE'}})})];
  for (const fetch of responses) assert.deepEqual(plain(await fixture({}, fetch).store.fetchLiveInfo('aaaaaa')), {online: false, openAt: null, category: '', viewerCount: null});
});

test('reinjecting the shared adapter preserves its identity and subscriptions', () => {
  const context = vm.createContext({});
  const source = fs.readFileSync(path.join(__dirname, '../favorites-store.js'), 'utf8');
  vm.runInContext(source, context);
  const original = vm.runInContext('CZFavoritesStore', context);
  vm.runInContext(source, context);
  assert.equal(vm.runInContext('CZFavoritesStore', context), original);
});

test('strict live refresh distinguishes a failed request from an offline broadcast', async () => {
  for (const fetch of [async () => {throw Error('network denied');}, async () => ({ok: false, status: 403})]) {
    const {store} = fixture({}, fetch);
    await assert.rejects(store.fetchLiveInfo('aaaaaa', {throwOnError: true}));
    assert.deepEqual(plain(await store.fetchLiveInfo('aaaaaa')), {online: false, openAt: null, category: '', viewerCount: null});
  }
});

test('delayed metadata matches UIDs and retains newly added items, groups and drag order', async () => {
  const f = fixture();
  await f.store.write(favorites, groups);
  const updates = {aaaaaa: {online: true}, bbbbbb: {name: '방송 B', group: 'wrong', order: 100}};
  let latest = f.store.moveFavorite(favorites, groups, 'cccccc', 'aaaaaa');
  latest = f.store.setFavoriteGroup(latest.favorites, latest.groups, 'bbbbbb', '빈 그룹');
  latest.favorites.push({uid: 'dddddd', name: 'new', group: '빈 그룹', order: 4});
  await f.store.write(latest.favorites, latest.groups);
  const result = plain(await f.store.writeInfo(updates));
  assert.deepEqual(result.favorites.map(f => f.uid), ['cccccc','aaaaaa','bbbbbb','dddddd']);
  assert.equal(result.favorites[1].online, true);
  assert.equal(result.favorites[2].name, '방송 B');
  assert.equal(result.favorites[2].group, '빈 그룹');
  assert.equal(result.favorites[2].order, 3);
  assert.equal(result.favorites[3].name, 'new');
  assert.deepEqual(result.groups, groups);
  await f.store.write(result.favorites.filter(f => f.uid !== 'aaaaaa'), result.groups);
  assert(!(await f.store.writeInfo(updates)).favorites.some(f => f.uid === 'aaaaaa'));
});

test('channel name is available from channel details while offline, with live-detail fallback', async () => {
  const urls = [];
  const f = fixture({}, async url => { urls.push(url); return {ok: true, json: async () => ({code: 200, content: {channelName: '오프라인 스트리머'}})}; });
  assert.equal(await f.store.fetchChannelName('aaaaaa'), '오프라인 스트리머');
  assert(urls[0].includes('/service/v1/channels/aaaaaa'));
  const fallback = fixture({}, async url => url.includes('/service/v1/') ? {ok: false} : {ok: true, json: async () => ({code: 200, content: {channel: {channelName: '라이브 스트리머'}}})});
  assert.equal(await fallback.store.fetchChannelName('aaaaaa'), '라이브 스트리머');
});

test('simultaneous streamer-name responses retain both names', async () => {
  const f = fixture();
  await f.store.write(favorites, groups);
  await Promise.all([
    f.store.writeInfo({aaaaaa: {name: '스트리머 A'}}),
    f.store.writeInfo({bbbbbb: {name: '스트리머 B'}})
  ]);
  const state = await f.store.read();
  assert.equal(state.favorites[0].name, '스트리머 A');
  assert.equal(state.favorites[1].name, '스트리머 B');
});

test('compact favorite duration pads hours/minutes and omits offline elapsed time', () => {
  const {store} = fixture();
  assert.equal(store.favoriteDuration({online: true, openAt: 1}, 1 + 5 * 60000), '00:05:00');
  assert.equal(store.favoriteDuration({online: true, openAt: 1}, 1 + 3661000), '01:01:01');
  assert.equal(store.favoriteStreamText({online: true, openAt: 1}, 1 + 3661000), '01:01:01 스트리밍 중');
  assert.equal(store.favoriteStreamText({online: false, openAt: 1}), '--');
  assert.equal(store.favoriteDuration({online: false, openAt: 1}), '--');
  assert.equal(store.favoriteDuration({online: true, openAt: null}), '--');
});

test('viewer counts format zero and unknown values and merge without changing group/order', () => {
  const {store} = fixture();
  assert.equal(store.favoriteViewerText({online: true, viewerCount: 1234}), '1,234');
  assert.equal(store.favoriteViewerText({online: true, viewerCount: 0}), '0');
  for (const value of [null, undefined, -1, 'bad']) assert.equal(store.favoriteViewerText({online: true, viewerCount: value}), '--');
  assert.equal(store.favoriteViewerText({online: false, viewerCount: 1234}), '--');
  const result = store.mergeInfo([{uid: 'a', group: '그룹', order: 2}], {a: {viewerCount: 1234}})[0];
  assert.equal(result.viewerCount, 1234);
  assert.equal(result.group, '그룹');
  assert.equal(result.order, 2);
});
