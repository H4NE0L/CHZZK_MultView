const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){const ctx=vm.createContext({Date});vm.runInContext(fs.readFileSync('src/shared/important-chat.js','utf8'),ctx);return ctx.CZImportantChat;}
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
