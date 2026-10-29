const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){const ctx=vm.createContext({Date,URL});vm.runInContext(fs.readFileSync('src/shared/important-chat.js','utf8'),ctx);return ctx.CZImportantChat;}
test('important chat filters match exact normalized names and independently selected roles',()=>{
 const api=setup(),settings=api.settings({names:[' Alice ','alice','가나다']});assert.equal(settings.names.length,2);
 assert(api.matches({name:'ALICE',role:''},settings));assert(!api.matches({name:'Alice2',role:''},settings));
 assert(api.matches({name:'other',role:'streamer'},settings));assert(api.matches({name:'other',role:'manager'},settings));
 assert(!api.matches({name:'other',role:'manager'},api.settings({managers:false})));
 assert(!api.matches({name:'Alice',role:'streamer'},api.settings({enabled:false,names:['Alice']})));
 assert.equal(api.settings({names:Array.from({length:60},(_,i)=>'user'+i)}).names.length,50);
});
test('important chat bounds message data and deduplicates IDs without dropping repeated text',()=>{
 const api=setup(),buffer=api.create(),filter=api.settings();buffer.reset('A');
 const item={id:'one',name:'방송인',text:'반복',role:'streamer',time:1};
 assert(buffer.add('A',[item],filter));assert(!buffer.add('A',[item],filter));
 buffer.add('A',[{...item,id:'two'}],filter);assert.equal(buffer.items.length,2);
 for(let i=0;i<150;i++)buffer.add('A',[{...item,id:'m'+i}],filter);
 assert.equal(buffer.items.length,100);assert.equal(buffer.items[0].id,'m50');
 assert(!buffer.add('B',[item],filter));buffer.reset('B');assert.equal(buffer.items.length,0);
 assert.equal(api.message({id:'x',name:'n',text:'a'.repeat(2000),role:'admin'}).text.length,1000);
 assert.equal(api.message({id:'x',name:'n',text:'t',role:'admin'}).role,'');
 assert.equal(api.message({id:'x',name:'n',text:{}}),null);
});
test('important chat messages still require exact frame source and CHZZK origin',()=>{
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('src/shared/messages.js','utf8'),ctx);
 const source={},frame={contentWindow:source},data={source:'chzzk-multiview',type:'IMPORTANT_CHAT_BATCH',uid:'A',messages:[]};
 assert(ctx.CZMessages.isPlayerMessage({origin:'https://chzzk.naver.com',source,data},frame));
 assert(!ctx.CZMessages.isPlayerMessage({origin:'https://foreign.invalid',source,data},frame));
 assert(!ctx.CZMessages.isPlayerMessage({origin:'https://chzzk.naver.com',source:{},data},frame));
});

test('collected chat limits image segments and accepts only HTTPS Naver image CDN URLs',()=>{
 const api=setup(),base={id:'rich',name:'user',text:'hello',role:'streamer'};
 const valid='https://ssl.pstatic.net/emote.png';
 const item=api.message({...base,segments:[{type:'text',text:'<script>hello</script>'},...Array.from({length:12},()=>({type:'image',src:valid,alt:'웃음'})),{type:'image',src:'javascript:alert(1)',alt:'unsafe'}],badges:[{src:valid,alt:'스트리머'},{src:'https://pstatic.net.evil.invalid/a',alt:'bad'}]});
 assert.equal(item.segments.filter(part=>part.type==='image').length,8);assert.equal(item.badges.length,1);
 assert(item.segments.some(part=>part.type==='text' && part.text==='unsafe'));
 for(const url of ['data:image/svg+xml,bad','http://ssl.pstatic.net/a','https://user:pass@ssl.pstatic.net/a','https://evil.invalid/a'])assert.equal(api.imageUrl(url),'');
 assert.equal(api.imageUrl(valid),valid);
});

test('streamer, manager and partner default on and remain independently filterable',()=>{
 const api=setup(),filter=api.settings({names:[]});
 assert.equal(filter.streamers,true);assert.equal(filter.managers,true);assert.equal(filter.partners,true);
 const item=api.message({id:'partner',name:'파트너 사용자',text:'안녕하세요',role:'partner'});
 assert.equal(item.role,'partner');assert(api.matches(item,filter));assert(!api.matches(item,api.settings({partners:false})));
 assert(api.matches({name:'owner',role:'streamer'},api.settings({partners:false})));
 assert.equal(api.settings({streamers:false,managers:false}).partners,true);
});

test('excluded names take priority over every role and manual inclusion',()=>{
 const api=setup(),filter=api.settings({names:['Alice'],excludedNames:[' Alice ','ALICE',null]});
 assert.equal(filter.excludedNames.length,1);
 for(const role of ['streamer','manager','partner',''])assert(!api.matches({name:'alice',role},filter));
 assert(api.matches({name:'Alice2',role:'streamer'},filter));
 assert.equal(api.settings().excludedNames.length,0);
 assert.equal(api.settings({excludedNames:Array.from({length:60},(_,i)=>'user'+i)}).excludedNames.length,50);
 const buffer=api.create();buffer.reset('A');assert(!buffer.add('A',[{id:'x',name:'Alice',text:'blocked',role:'streamer'}],filter));
});
test('changing inclusion retains collected history and exclusion removes only that author',()=>{
 const api=setup(),buffer=api.create(),original=api.settings({names:['Alice','Bob']});buffer.reset('A');buffer.add('A',[{id:'a',name:'Alice',text:'old',time:1234},{id:'b',name:'Bob',text:'keep',time:5678}],original);
 buffer.applySettings(api.settings({names:['Alice','Bob','Charlie']}));assert.equal(buffer.items.length,2);assert.equal(buffer.items[1].time,5678);
 buffer.applySettings(api.settings({names:['Charlie'],excludedNames:['ALICE']}));assert.equal(buffer.items.length,1);assert.equal(buffer.items[0].id,'b');
 buffer.applySettings(api.settings({enabled:false}));assert.equal(buffer.items.length,1);
 buffer.add('A',[{id:'missing',name:'Bob',text:'historical metadata',updateOnly:true,time:9999}],original);assert.equal(buffer.items.length,1);
 buffer.add('A',[{id:'b',name:'Bob',text:'keep',updateOnly:true,time:9999}],original);assert.equal(buffer.items.length,1);assert.equal(buffer.items[0].time,9999);
 assert.equal(api.message({id:'unknown',name:'A',text:'x'}).time,null);
});
