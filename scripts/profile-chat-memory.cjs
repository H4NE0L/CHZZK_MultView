// Measures only the bounded fingerprint history in a synthetic Chromium page.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),{buildSync}=require('esbuild'),{execFileSync}=require('node:child_process');
const baseline=process.argv[2]||null;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/lib/chromium/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setContent('<div id="list"></div>');
  await page.addScriptTag({content:fs.readFileSync('dist/src/shared/important-chat.js','utf8')});
  let source=baseline?execFileSync('git',['show',`${baseline}:src/content/chat-collector.js`],{encoding:'utf8'}):fs.readFileSync('src/content/chat-collector.js','utf8');
  source=source.replace(/return \{configure,stop(?:,dispose)?\};/,match=>match.replace('};',',debugHistory:()=>history.size,debugClear:()=>history.clear()};'));
  const built=buildSync({stdin:{contents:source,resolveDir:path.resolve('src/content'),sourcefile:'chat-collector.js'},bundle:true,format:'iife',target:'chrome119',write:false});
  await page.addScriptTag({content:built.outputFiles[0].text});
  await page.evaluate(async()=>{
   window.collector=CZChatCollector.create({send:()=>{}});collector.configure({enabled:true,streamers:false,managers:false,partners:false,names:['memory user']});const list=document.querySelector('#list');
   for(let batch=0;batch<60;batch++){
    for(let i=0;i<40;i++){const row=document.createElement('div');row.dataset.chatMessage='';row.innerHTML=`<span data-chat-nickname>memory user</span><span data-chat-text>${'message '.repeat(60)} ${batch*40+i}</span>`;list.append(row);}
    while(list.children.length>200)list.firstElementChild.remove();await new Promise(resolve=>setTimeout(resolve,0));
   }
   collector.stop();
  });
  const session=await page.context().newCDPSession(page);await session.send('HeapProfiler.collectGarbage');
  const before=await session.send('Runtime.getHeapUsage'),entries=await page.evaluate(()=>collector.debugHistory());
  if(entries!==2048)throw Error(`Expected the bounded history to contain 2048 entries, got ${entries}`);
  await page.evaluate(()=>collector.debugClear());await session.send('HeapProfiler.collectGarbage');const after=await session.send('Runtime.getHeapUsage');
  console.log(JSON.stringify({variant:baseline||'working',entries,processedMessages:2400,retainedDomRows:200,historyHeapBytes:before.usedSize-after.usedSize,scope:'Synthetic JS heap difference after full GC before/after clearing only the history. Excludes video, recording buffers and real CHZZK.'},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
