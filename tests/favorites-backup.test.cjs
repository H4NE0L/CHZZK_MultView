const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=process.env.CZ_TEST_ROOT || path.resolve(__dirname,'../dist');
const F='chzzkMultiviewFavoritesV08',G='chzzkMultiviewFavoriteGroupsV02',O='chzzkFavoriteGroupOptionsV2',P='chzzkFavoritesBeforeRestoreV1';
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(initial={},fail=false){
 const data=structuredClone(initial),writes=[];
 const context=vm.createContext({chrome:{storage:{local:{get:async()=>structuredClone(data),set:async payload=>{if(fail)throw Error('disk failure');writes.push(plain(payload));Object.assign(data,structuredClone(payload));}}}}});
 for(const file of ['chzzk-api','favorites-store','favorites-backup'])vm.runInContext(fs.readFileSync(path.join(root,`src/shared/${file}.js`),'utf8'),context);
 return {api:context.CZFavoritesBackup,data,writes};
}
test('portable export keeps memberships, empty groups/order/colors and excludes unrelated storage',async()=>{
 const f=setup({[F]:[{uid:'aaaaaa',name:'A',groups:['둘','하나'],order:2,online:true,secret:'not exported'},{uid:'bbbbbb',name:'B',group:'하나',order:1}],[G]:['빈 그룹','둘','하나'],[O]:{'둘':{color:'#123abc',showOffline:false,secret:'not exported'}},cookies:'not exported'});
 const backup=plain(await f.api.create());
 assert.equal(backup.version,1);assert.deepEqual(backup.data.favorites.map(f=>f.uid),['bbbbbb','aaaaaa']);
 assert.deepEqual(backup.data.favorites[1].groups,['둘','하나']);assert.equal(backup.data.groups[0],'빈 그룹');
 assert.equal(backup.data.groupOptions['둘'].color,'#123abc');assert(!JSON.stringify(backup).includes('not exported'));assert.equal(f.writes.length,0);
 assert.deepEqual(plain(f.api.parse(JSON.parse(JSON.stringify(backup)))),backup);
});
test('legacy console export imports names/groups without modifying storage during preview',()=>{
 const f=setup();const document=f.api.parse({chzzkMultiviewFavoritesV07:[{uid:'aaaaaa',name:'A',group:'이전 그룹'}],chzzkMultiviewFavoriteGroupsV01:['빈 그룹']});
 assert.equal(document.data.favorites[0].name,'A');assert(document.data.groups.includes('이전 그룹'));assert(document.data.groups.includes('빈 그룹'));assert.equal(f.writes.length,0);
});
test('merge preserves current metadata/order while adding memberships, channels and group colors',async()=>{
 const f=setup({[F]:[{uid:'aaaaaa',name:'현재 이름',groups:['기존'],online:true,order:1}],[G]:['기존'],[O]:{'기존':{color:'#111111'}}});
 const input={favorites:[{uid:'aaaaaa',name:'옛 이름',groups:['가져온 그룹']},{uid:'bbbbbb',name:'B',groups:['가져온 그룹']}],groups:['빈 그룹'],groupOptions:{'가져온 그룹':{color:'#abcdef'}}};
 const result=plain(await f.api.restore(input));
 assert.equal(result.favorites.length,2);assert.equal(result.favorites[0].name,'현재 이름');assert.equal(result.favorites[0].online,true);
 assert.deepEqual(result.favorites[0].groups,['기존','가져온 그룹']);assert.equal(f.data[O]['가져온 그룹'].color,'#abcdef');
 assert.equal(f.data[P].data.favorites.length,1);assert.equal(f.writes.length,1);assert(F in f.writes[0] && P in f.writes[0]);
});
test('replace and restore previous snapshot keep a recoverable copy for both directions',async()=>{
 const f=setup({[F]:[{uid:'aaaaaa',name:'A',group:'기존'}],[G]:['기존']});
 await f.api.restore({favorites:[{uid:'bbbbbb',name:'B',groups:['신규']}],groups:['신규']},'replace');
 assert.deepEqual(f.data[F].map(f=>f.uid),['bbbbbb']);
 await f.api.restore(await f.api.previous(),'replace');assert.deepEqual(f.data[F].map(f=>f.uid),['aaaaaa']);
 assert.deepEqual(plain((await f.api.previous()).data.favorites.map(f=>f.uid)),['bbbbbb']);
});
test('malformed/foreign/versioned files never clear data and failed writes preserve original storage',async()=>{
 const f=setup({[F]:[{uid:'aaaaaa',name:'A'}]});
 for(const input of [{},{format:'foreign',favorites:[]},{format:'cz-control-room-favorites',version:2},{favorites:[{uid:'https://evil.invalid/'}]},{favorites:[{uid:'aaaaaa',groups:[{}]}]}])await assert.rejects(f.api.restore(input));
 assert.equal(f.writes.length,0);assert.equal(f.data[F].length,1);
 const failed=setup({[F]:[{uid:'aaaaaa',name:'A'}]},true);
 await assert.rejects(failed.api.restore({favorites:[],groups:[]},'replace'),/disk failure/);
 assert.equal(failed.data[F].length,1);assert.equal(failed.data[P],undefined);
});
test('duplicate UIDs and prototype-like group names are handled as data',()=>{
 const f=setup();const backup=plain(f.api.parse(JSON.parse('{"favorites":[{"uid":"aaaaaa","groups":["__proto__"]},{"uid":"aaaaaa","groups":["constructor"]}],"groups":["__proto__"],"groupOptions":{"__proto__":{"color":"#123456"}}}')));
 assert.equal(backup.data.favorites.length,1);assert.deepEqual(backup.data.favorites[0].groups,['__proto__','constructor']);
 assert.equal(backup.data.groupOptions.__proto__.color,'#123456');assert.equal({}.color,undefined);
});
