const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.CZ_TEST_ROOT||path.resolve(__dirname,'../dist'),context=vm.createContext({});
for(const file of ['roles','history'])vm.runInContext(fs.readFileSync(path.join(root,`src/shared/chat/${file}.js`),'utf8'),context);
const roles=context.CZChatRoles,history=context.CZChatHistory;
test('role labels, semantic markers and color fallback preserve independent roles',()=>{
 for(const [label,role] of [['스트리머 배지','streamer'],['CHANNEL MANAGER icon','manager'],['파트너 스트리머','partner']])assert.equal(roles.evidence([label],[]).role,role);
 assert.equal(roles.evidence([],['partner_streamer.svg']).role,'partner');
 assert.equal(roles.evidence([],['supermanagerfan']).role,'');
 assert.equal(roles.colorRole('rgb(255, 180, 50)'),'streamer');assert.equal(roles.colorRole('rgb(30, 140, 255)'),'manager');assert.equal(roles.colorRole('rgb(0, 220, 155)'),'partner');
 for(const color of ['rgb(255,255,255)','rgb(100,100,100)','transparent','not a color'])assert.equal(roles.colorRole(color),'');
 assert.equal(roles.strongest('streamer','manager'),'streamer');assert.equal(roles.strongest('partner','manager'),'manager');
 assert.equal(roles.nameKey(' ALICE '),'alice');assert.equal(roles.nameKey('가'),'가');
});
test('bounded history evicts oldest entries and never retains message text or DOM',()=>{
 const cache=history.create(2),identity={id:'one',time:123,element:{},text:'not retained'};
 cache.remember('first',identity,'secret message',true);cache.remember('second',{id:'two',time:null},'second',true);
 const entry=cache.get('first');assert.deepEqual(Object.keys(entry).sort(),['id','matched','signature','time']);assert(!JSON.stringify(entry).includes('secret message'));
 cache.remember('third',{id:'three',time:null},'third',true);assert.equal(cache.size,2);assert.equal(cache.get('first'),undefined);
 cache.remember('second',{id:'updated',time:1},'new signature',true);cache.remember('fourth',{id:'four',time:null},'four',true);
 assert.equal(cache.get('third'),undefined);assert.equal(cache.get('second').id,'updated');
 cache.remember('ignored',{id:'x',time:null},'ignored',false);assert.equal(cache.size,2);assert.equal(cache.get('ignored'),undefined);
 cache.clear();assert.equal(cache.size,0);assert.throws(()=>history.create(0));
});
