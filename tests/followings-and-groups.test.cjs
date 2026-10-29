const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function fixture(fetch) {
  const data = {};
  const ctx = vm.createContext({fetch, chrome:{storage:{local:{get:async key => typeof key === 'string' ? {[key]:data[key]} : data, set:async value => Object.assign(data,value)},onChanged:{addListener(){},removeListener(){}}}}});
  for (const file of ['chzzk-api','favorites-store','followings-store']) vm.runInContext(fs.readFileSync(path.join(process.env.CZ_TEST_ROOT || path.join(__dirname,'..'), `src/shared/${file}.js`),'utf8'),ctx);
  return {api:ctx.CZChzzkApi,store:ctx.CZFavoritesStore,follow:ctx.CZFollowings,data};
}
const json = content => ({ok:true,status:200,json:async () => ({code:200,content})});
test('following pagination keeps all typed channel names, status and credentials', async () => {
  const requests=[];
  const f=fixture(async (url, opts) => {
    requests.push([url,opts]);
    const page=Number(new URL(url).searchParams.get('page'));
    return json({totalCount:51,followingList:Array.from({length:page===0?50:1},(_,i) => ({channel:{channelId:`uid${String(page*50+i).padStart(3,'0')}`,channelName:`방송 ${page*50+i}`,openLive:false}}))});
  });
  const list=await f.api.fetchFollowings();
  assert.equal(list.length,51);
  assert(list.every(channel=>channel.online===false));
  assert.equal(list[50].name,'방송 50');
  assert.equal(requests.length,2);
  assert.equal(requests[0][1].credentials,'include');
});
test('live-state request failure keeps authoritative following-online hint without fabricating a name', async () => {
  const f=fixture(async url => url.includes('followings?') ? json({followingList:[{channel:{channelId:'aaaaaa',channelName:'공식 방송인',openLive:true}}]}) : {ok:false,status:503});
  const channels=await f.api.fetchFollowings();
  assert.equal(channels[0].name,'공식 방송인');
  assert.equal(channels[0].online,true);
});
test('failed login or malformed channel payload retains cached followings', async () => {
  let response=json({followingList:[{channel:{channelId:'aaaaaa',channelName:'공식 방송인',openLive:false}}]});
  const f=fixture(async()=>response);
  await f.follow.refresh();
  const before=JSON.stringify(f.data);
  response={ok:false,status:401};
  await assert.rejects(f.follow.refresh(),/로그인/);
  assert.equal(JSON.stringify(f.data),before);
  response=json({followingList:[{nickname:'채팅 시청자'}]});
  await assert.rejects(f.follow.refresh(),/채널 정보/);
  assert.equal(JSON.stringify(f.data),before);
});
test('UID-mismatched API response cannot overwrite stored broadcaster names', async () => {
  const f=fixture(async()=>json({channelId:'bbbbbb',channelName:'다른 방송인'}));
  assert.equal(await f.api.fetchChannelName('aaaaaa'),null);
});
test('refresh repairs corrupted favorite names from API even while offline', async () => {
  const f=fixture(async url => url.endsWith('/live-detail') ? json({status:'CLOSE'}) : json({channelId:'aaaaaa',channelName:'공식 방송인'}));
  const info=await f.api.fetchFavoriteInfo('aaaaaa',{throwOnError:true});
  const updated=f.store.mergeInfo([{uid:'aaaaaa',name:'채팅 시청자',group:'그룹',order:7}],{aaaaaa:info});
  assert.equal(updated[0].name,'공식 방송인');
  assert.equal(updated[0].group,'그룹');
  assert.equal(updated[0].order,7);
  assert.equal(updated[0].online,false);
});
test('checklist groups add memberships and preserve existing global item order', () => {
  const {store}=fixture(async()=>{throw Error('unused');});
  const state=store.setGroupMembers([{uid:'aaaaaa',name:'A',group:'원래 그룹',order:1}],['원래 그룹'],null,'새 그룹',[{uid:'aaaaaa',name:'A'},{uid:'bbbbbb',name:'B'}]);
  assert.deepEqual(Array.from(state.favorites[0].groups),['원래 그룹','새 그룹']);
  assert.equal(state.favorites[0].order,1);
  assert.equal(state.favorites[1].order,2);
  assert.equal(store.itemsForGroup(state.favorites,'새 그룹').length,2);
  const renamed=store.renameGroup(state.favorites,state.groups,'새 그룹','이름 변경');
  assert(renamed.favorites[0].groups.includes('이름 변경'));
  const removed=store.deleteGroup(renamed.favorites,renamed.groups,'이름 변경');
  assert.deepEqual(Array.from(removed.favorites[0].groups),['원래 그룹']);
  assert.deepEqual(Array.from(removed.favorites[1].groups),[]);
});
test('empty or duplicate group names are rejected; group shifting never reorders items', () => {
  const {store}=fixture(async()=>{throw Error('unused');});
  assert.throws(()=>store.setGroupMembers([],['기존'],null,'기존',[]),/이미 존재/);
  assert.throws(()=>store.setGroupMembers([],[],null,' ',[]),/그룹 이름/);
  const favorites=[{uid:'aaaaaa',group:'A',order:1},{uid:'bbbbbb',group:'B',order:2}];
  const state=store.shiftGroup(favorites,['A','B'],'B',-1);
  assert.deepEqual(Array.from(state.groups).slice(0,2),['B','A']);
  assert.deepEqual(Array.from(state.favorites,f=>f.uid),['aaaaaa','bbbbbb']);
});

test('group memberships and display options commit together and survive metadata writes', async () => {
  const f=fixture(async()=>{throw Error('unused');});
  await f.store.write([{uid:'aaaaaa',name:'A',group:'그룹'}],['그룹'],{'그룹':{color:'#00dc9b',showOffline:false}});
  assert.equal(f.data[f.store.GROUP_OPTIONS_KEY]['그룹'].showOffline,false);
  await f.store.writeInfo({aaaaaa:{online:true}});
  assert.equal(f.data[f.store.GROUP_OPTIONS_KEY]['그룹'].color,'#00dc9b');
  assert.equal(f.data[f.store.FAVORITES_KEY][0].online,true);
});

test('API lookup passes a 15-second deadline to fetch', async () => {
  const signal = {};
  const ctx = vm.createContext({AbortSignal:{timeout: delay => {assert.equal(delay,15000);return signal;}},fetch:async (_url,options) => {assert.equal(options.signal,signal);return json({channelId:'aaaaaa',channelName:'공식 방송인'});}});
  vm.runInContext(fs.readFileSync(path.join(process.env.CZ_TEST_ROOT || path.join(__dirname,'..'), 'src/shared/chzzk-api.js'),'utf8'),ctx);
  assert.equal(await ctx.CZChzzkApi.fetchChannelName('aaaaaa'),'공식 방송인');
});

test('JSON-level service errors are not treated as offline by strict refresh', async () => {
  const f=fixture(async()=>({ok:true,status:200,json:async()=>({code:401,content:null})}));
  await assert.rejects(f.api.fetchLiveInfo('aaaaaa',{throwOnError:true}),/응답/);
});

test('successful null live detail and closed broadcasts are offline, malformed responses still fail', async () => {
  for (const content of [null, {status:'CLOSED'}, {status:'CLOSE'}]) {
    const f=fixture(async()=>json(content));
    assert.equal((await f.api.fetchLiveInfo('aaaaaa',{throwOnError:true})).online,false);
  }
  for (const content of [undefined, {}, {status:'UNKNOWN'}]) {
    const f=fixture(async()=>json(content));
    await assert.rejects(f.api.fetchLiveInfo('aaaaaa',{throwOnError:true}),/응답/);
  }
});
