const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage();let amount=300,status=200,requests=0;
 await page.clock.install();

 await page.route('https://api.chzzk.naver.com/**',route=>{const headers={'Access-Control-Allow-Origin':'https://chzzk.naver.com','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Accept,Front-Client-Platform-Type,Front-Client-Product-Type','Access-Control-Allow-Methods':'GET,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});requests++;return route.fulfill({status,headers,json:{code:status,content:{channelId:'channelA',active:true,amount}}});});
 await page.route('https://chzzk.naver.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><body style="margin:0"><aside class="live_chat" style="width:320px;height:600px"><div data-chat-toolbar><h2>채팅</h2><button>-</button><span>100%</span><button>+</button><button>⋮</button></div><div id="profile">내 통나무 파워 500</div></aside></body>'}));
 await page.goto('https://chzzk.naver.com/live/channelA/chat?multiview=1');
 for(const file of ['src/shared/important-chat.js','src/content/chat-layout.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.evaluate(()=>{CZChatLayout.setPresentation({name:'방송인'});CZChatLayout.start();});
 await page.waitForFunction(()=>document.querySelector('#cz-chat-power .cz-power-value')?.textContent==='300');assert.equal(requests,1,'only selected chat channel is queried');
 amount=345;await page.clock.fastForward(30001);await page.waitForFunction(()=>document.querySelector('#cz-chat-power .cz-power-value').textContent==='345');assert.equal(requests,2,'API value takes priority over stale profile DOM');
 await page.evaluate(()=>document.querySelector('#profile').remove());status=401;await page.clock.fastForward(30001);await page.waitForFunction(()=>document.querySelector('#cz-chat-power').dataset.fresh==='false');assert.equal(await page.locator('.cz-power-value').textContent(),'345','failed lookup retains last verified value');
 status=200;amount=0;await page.clock.fastForward(30001);await page.waitForFunction(()=>document.querySelector('.cz-power-value').textContent==='0');
 const before=requests;await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.clock.fastForward(60001);assert.equal(requests,before,'closed chat stops balance polling');
 console.log('PASS: authenticated-shape API balance starts without opening profile, updates each 30s, keeps last value on failure and stops with chat.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
