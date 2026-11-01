const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.route('https://chzzk.naver.com/**',route=>route.fulfill({body:'<!doctype html><body><div id="messages"></div>'}));
  await page.goto('https://chzzk.naver.com/live/aaaaaa/chat?multiview=1');
  await page.evaluate(()=>{window.__NativeSocket=class extends EventTarget {static OPEN=1;constructor(url){super();this.url=url;}send(){window.__sent=(window.__sent||0)+1;}};window.WebSocket=__NativeSocket;});
  for(const file of ['src/content/chat-socket-main.js','src/content/chat-metadata-main.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(()=>{
   window.__socket=new WebSocket('wss://kr-ss1.chat.naver.com/chat');window.__nativeReads=0;__socket.addEventListener('message',()=>__nativeReads++);
   window.__receive=messages=>__socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({cmd:93101,bdy:messages})}));
   window.__row=(text,id)=>{const row=document.createElement('div');row.className='_chatting_message_test_1';if(id)row.dataset.messageId=id;row.innerHTML='<span class="_nickname_test_1">작성자</span><span data-chat-text></span>';row.querySelector('[data-chat-text]').textContent=text;document.querySelector('#messages').replaceChildren(row);return row;};
   __receive([{msgTime:1793277296000,profile:{nickname:'작성자'},msg:'OFF에서 무시'}]);
   if(__CZChatSourceTimesV1.size!==0)throw Error('Default OFF captured socket time');
   document.documentElement.setAttribute('data-cz-timestamps-enabled','true');document.dispatchEvent(new Event('cz-chat-timestamps-config'));
   __receive([{msgId:'m1',msgTime:1793277296000,profile:JSON.stringify({nickname:'작성자'}),msg:'원본 작성 시각'}]);__row('원본 작성 시각','m1');
  });
  await page.waitForFunction(()=>document.querySelector('[data-cz-message-time]')?.getAttribute('data-cz-message-time')==='2026-10-29T12:34:56.000Z');
  assert(await page.evaluate(()=>__socket instanceof WebSocket && WebSocket.OPEN===1));
  await page.evaluate(()=>__row('원본 작성 시각','m1'));
  await page.waitForFunction(()=>!!document.querySelector('[data-cz-message-time]'));
  await page.evaluate(()=>{__receive([{msgId:'m2',msgTime:1793277396000,profile:{nickname:'작성자'},msg:'원본 작성 시각'}]);__row('원본 작성 시각');});
  await page.waitForTimeout(100);assert.equal(await page.locator('[data-cz-message-time]').count(),0,'ambiguous identical messages need source ID');
  await page.evaluate(()=>__row('원본 작성 시각','m2'));await page.waitForFunction(()=>document.querySelector('[data-cz-message-time]')?.getAttribute('data-cz-message-time')==='2026-10-29T12:36:36.000Z');
  await page.evaluate(()=>{__row('원본 작성 시각','m2').querySelector('._nickname_test_1').textContent='다른 작성자';});await page.waitForFunction(()=>!document.querySelector('[data-cz-message-time]'));
  await page.evaluate(()=>{
   __socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({cmd:93101,bdy:JSON.stringify([{createTime:1793277496000,profile:{nickname:'작성자'},content:'문자열 본문 작성 시각'}])})}));
   __row('문자열 본문 작성 시각');
  });
  await page.waitForFunction(()=>document.querySelector('[data-cz-message-time]')?.getAttribute('data-cz-message-time')==='2026-10-29T12:38:16.000Z');
  // DOM can arrive before the passive socket listener sees the packet.
  await page.evaluate(()=>{const row=__row('');row.querySelector('[data-chat-text]').innerHTML='<img src="https://ssl.pstatic.net/emote.png?type=small">';});
  await page.waitForTimeout(120);
  await page.evaluate(()=>__receive([{msgTime:1793277296000,profile:{nickname:'작성자'},msg:'{:emoticon_0:}',extras:JSON.stringify({emojis:{emoticon_0:'https://ssl.pstatic.net/emote.png?type=original'}})}]));
  await page.waitForFunction(()=>document.querySelector('[data-cz-message-time]')?.getAttribute('data-cz-message-time')==='2026-10-29T12:34:56.000Z');
  await page.evaluate(()=>{__receive([{msgId:'emote-id',msgTime:1793277396000,profile:{nickname:'작성자'},msg:'{:unknown:}'}]);__row('다르게 렌더링된 이모티콘','emote-id');});
  await page.waitForFunction(()=>document.querySelector('[data-cz-message-time]')?.getAttribute('data-cz-message-time')==='2026-10-29T12:36:36.000Z');
  await page.evaluate(()=>{__receive([{regTime:1793277496000,profile:{nickname:'작성자'},msg:'별도 원본 시각 필드'}]);__row('별도 원본 시각 필드');});
  await page.waitForFunction(()=>document.querySelector('[data-cz-message-time]')?.getAttribute('data-cz-message-time')==='2026-10-29T12:38:16.000Z');
  await page.evaluate(()=>{for(let i=0;i<2300;i++)__receive([{msgTime:1793277296000,profile:{nickname:'작성자'},msg:'메시지 '+i}]);});
  assert.equal(await page.evaluate(()=>__CZChatSourceTimesV1.size),2048);assert.equal(await page.evaluate(()=>window.__sent||0),0);assert.equal(await page.evaluate(()=>__nativeReads),2307);
  await page.evaluate(()=>{document.documentElement.setAttribute('data-cz-timestamps-enabled','false');document.dispatchEvent(new Event('cz-chat-timestamps-config'));__receive([{msgTime:1793277296000,profile:{nickname:'작성자'},msg:'OFF 후 무시'}]);});
  assert.equal(await page.evaluate(()=>__CZChatSourceTimesV1.size),0,'OFF clears the index and removes socket data listeners');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.evaluate(()=>__CZChatSourceTimesV1.size),0);assert(await page.evaluate(()=>WebSocket===__NativeSocket));
  const early=await browser.newPage();
  await early.route('https://chzzk.naver.com/**',route=>route.fulfill({body:'<!doctype html><body><div id="messages"></div>'}));
  await early.goto('https://chzzk.naver.com/live/aaaaaa/chat?multiview=1&cz_timestamps=1');
  await early.evaluate(()=>{window.WebSocket=class extends EventTarget{constructor(url){super();this.url=url;}send(){throw Error('must stay passive');}};});
  await early.addScriptTag({content:fs.readFileSync('src/content/chat-socket-main.js','utf8')});
  await early.evaluate(()=>{const socket=new WebSocket('wss://kr-ss1.chat.naver.com/chat');socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({bdy:{messageList:[{msgTime:1793277296000,profile:{nickname:'작성자'},msg:'초기 기록'}]}})}));document.querySelector('#messages').innerHTML='<div data-chat-message><span data-chat-nickname>작성자</span><span data-chat-text>초기 기록</span></div>';});
  await early.addScriptTag({content:fs.readFileSync('src/content/chat-metadata-main.js','utf8')});
  await early.waitForFunction(()=>document.querySelector('[data-cz-message-time]')?.getAttribute('data-cz-message-time')==='2026-10-29T12:34:56.000Z');
  await early.evaluate(()=>{document.documentElement.setAttribute('data-cz-timestamps-enabled','false');document.dispatchEvent(new Event('cz-chat-timestamps-config'));});
  assert.equal(await early.evaluate(()=>__CZChatSourceTimesV1.size),0,'explicit OFF overrides early URL opt-in');
  assert.equal(await early.locator('[data-cz-message-time]').count(),0);
  await early.close();
  console.log('PASS: passive native socket timestamps, exact author/text/ID matching, ambiguous duplicates, remount, 2048 bound and teardown; no socket sends.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
