// Synthetic DOM benchmark; excludes video decode, network and real-site scripts.
// Usage: node scripts/profile-chat.cjs [baseline git ref]
const {chromium}=require('playwright'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const baseline=process.argv[2]||'f2afbf3';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/lib/chromium/chromium',headless:true,args:['--no-sandbox']});
 try{
  const results=[];
  for(let round=0;round<3;round++)for(const variant of ['baseline','working']){
   const page=await browser.newPage();await page.route('https://chzzk.naver.com/**',route=>route.fulfill({body:'<!doctype html><body style="margin:0"><aside class="live_chat" style="height:600px"><div data-chat-toolbar><h2>채팅</h2><button>-</button><span>100%</span><button>+</button><button>⋮</button></div><div id="messages"></div></aside>'}));
   await page.goto('https://chzzk.naver.com/live/test/chat');
   for(const path of ['src/shared/important-chat.js','src/content/chat-layout.js','src/content/chat-collector.js']){
    let source=variant==='baseline'?execFileSync('git',['show',`${baseline}:${path}`],{encoding:'utf8'}):fs.readFileSync('dist/'+path,'utf8');
    if(path.endsWith('chat-collector.js'))source=source.replace('function read(row) {','function read(row) { globalThis.__reads++;');
    await page.addScriptTag({content:source});
   }
   const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
   const before=(await session.send('Performance.getMetrics')).metrics.find(metric=>metric.name==='TaskDuration').value;
   const result=await page.evaluate(async()=>{
    window.__reads=0;let received=0;CZChatLayout.start();const collector=CZChatCollector.create({send:batch=>received+=batch.length});
    collector.configure({enabled:true,names:['target']});
    const list=document.querySelector('#messages'),start=performance.now();
    for(let batch=0;batch<40;batch++){
     for(let i=0;i<10;i++){const row=document.createElement('div');row.className='_chatting_message_bench_1';row.innerHTML=`<span class="_nickname_bench_1">${i===0?'target':'viewer'}</span><span data-chat-text>message ${batch*10+i}</span>`;list.append(row);}
     while(list.children.length>200)list.firstElementChild.remove();
     await new Promise(resolve=>setTimeout(resolve,0));
    }
    const duration=performance.now()-start;await new Promise(resolve=>setTimeout(resolve,300));collector.stop();
    return {durationMs:Number(duration.toFixed(1)),readCalls:window.__reads,received};
   });const after=(await session.send('Performance.getMetrics')).metrics.find(metric=>metric.name==='TaskDuration').value;results.push({variant,round,...result,mainThreadTaskMs:Number(((after-before)*1000).toFixed(1))});await page.close();
  }
  console.log(JSON.stringify({baseline,workload:'400 messages in batches of 10; DOM retains 200; 10% match; 3 runs',results},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
