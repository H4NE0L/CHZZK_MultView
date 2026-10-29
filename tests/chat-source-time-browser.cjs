// Real isolated-world DOM bridge; React message objects are synthetic fixtures.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/lib/chromium/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.route('https://chzzk.naver.com/**',route=>route.fulfill({body:'<!doctype html><body style="margin:0"><aside class="live_chat" style="height:600px"><div data-chat-toolbar><h2>채팅</h2><button>-</button><span>100%</span><button>+</button><button>⋮</button></div><div id="messages"></div></aside>'}));await page.goto('https://chzzk.naver.com/live/test/chat');
  await page.evaluate(()=>{const row=document.createElement('div');row.id='message';row.className='_chatting_message_test_1';row.innerHTML='<span class="_nickname_test_1">작성자<span class="_blind_hidden">마크</span></span><span>원본 본문</span>';row.__reactProps$fixture={chattingMessage:{messageTime:Date.parse('2026-10-28T12:34:56Z'),profile:JSON.stringify({nickname:'작성자'}),content:'원본 본문'}};document.querySelector('#messages').append(row);});
  const session=await page.context().newCDPSession(page),tree=await session.send('Page.getFrameTree'),world=await session.send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'extension-fixture'});
  const evaluate=async expression=>{const result=await session.send('Runtime.evaluate',{contextId:world.executionContextId,expression,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
  assert.equal(await evaluate("!!document.querySelector('#message').__reactProps$fixture"),false,'isolated content scripts cannot see source React props');
  for(const file of ['src/shared/important-chat.js','src/content/chat-layout.js'])await evaluate(fs.readFileSync(file,'utf8'));
  await evaluate('CZChatLayout.start()');assert.equal(await page.locator('.cz-native-chat-time').count(),0,'no observation-time fallback');
  await page.addScriptTag({content:fs.readFileSync('src/content/chat-metadata-main.js','utf8')});
  await page.waitForFunction(()=>document.querySelector('#message .cz-native-chat-time')?.dateTime==='2026-10-28T12:34:56.000Z');
  await page.evaluate(()=>{Date.now=()=>Date.parse('2026-10-29T18:00:00Z');const old=document.querySelector('#message'),row=old.cloneNode(true);row.querySelector('time').remove();row.removeAttribute('data-cz-message-time');row.__reactProps$fixture=old.__reactProps$fixture;old.replaceWith(row);});
  await page.waitForFunction(()=>document.querySelector('#message .cz-native-chat-time')?.dateTime==='2026-10-28T12:34:56.000Z');
  // A different source sender/content must never supply the timestamp.
  await page.evaluate(()=>{const row=document.querySelector('#message');row.__reactProps$fixture={chattingMessage:{messageTime:Date.parse('2026-10-28T13:00:00Z'),profile:{nickname:'다른 사용자'},content:'원본 본문'}};row.setAttribute('data-item-index','2');});
  await page.waitForFunction(()=>!document.querySelector('#message .cz-native-chat-time'));
  await page.evaluate(()=>{const row=document.querySelector('#message');row.__reactProps$fixture={chattingMessage:{messageTime:Date.parse('2026-10-28T13:14:15Z'),profile:{nickname:'작성자'},content:'원본 본문'}};row.setAttribute('data-item-index','3');});
  await page.waitForFunction(()=>document.querySelector('#message .cz-native-chat-time')?.dateTime==='2026-10-28T13:14:15.000Z');
  await page.evaluate(()=>{const row=document.querySelector('#message');row.__reactProps$fixture={className:'native-row'};row.__reactFiber$fixture={memoizedProps:{},return:{memoizedProps:{message:{ctime:Date.parse('2026-10-28T10:00:00Z')/1000,profile:{nickname:'작성자'},content:'원본 본문'}}}};row.setAttribute('data-item-index','4');});
  await page.waitForFunction(()=>document.querySelector('#message .cz-native-chat-time')?.dateTime==='2026-10-28T10:00:00.000Z');
  await page.evaluate(()=>{const row=document.querySelector('#message');delete row.__reactFiber$fixture;const message={messageTime:Date.parse('2026-10-28T11:00:00Z'),profile:{nickname:'작성자'}};Object.defineProperty(message,'content',{get(){window.__unexpectedGetter=true;return '원본 본문';}});row.__reactProps$fixture={message};row.setAttribute('data-item-index','5');});
  await page.waitForFunction(()=>!document.querySelector('#message .cz-native-chat-time'));assert.equal(await page.evaluate(()=>!!window.__unexpectedGetter),false,'source data getters are not invoked');
  console.log('PASS: isolated content sees only verified source-message time; scroll remount stays fixed; mismatched author is rejected and row reuse updates time.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
