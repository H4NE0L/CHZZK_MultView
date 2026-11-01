const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage();await page.setContent('<main id="messages"></main>');
 await page.evaluate(()=>{
  document.documentElement.setAttribute('data-cz-timestamps-enabled','true');
  window.__make=(id,message)=>{const row=document.createElement('div');row.dataset.chatMessage='';row.id=id;row.innerHTML='<span data-chat-nickname>화면에 보이는 이름·배지</span><span data-chat-text>화면 본문</span>';row.__reactProps$fixture={children:{props:{chatMessage:message}}};document.querySelector('main').append(row);return row;};
  __make('no-profile',{messageTime:1793277296000,content:'다른 표현'});
  __make('segments',{messageTime:1793277296000,content:[{text:'배열 본문'}]});
  const getter={messageTime:1793277296000};Object.defineProperty(getter,'content',{get(){__unexpectedGetter=true;return '접근하면 안 됨';}});__make('getter',getter);
  const fresh=__make('time-only',{messageTime:1793277296000});fresh.__reactFiber$stale={memoizedProps:{chatMessage:{messageTime:1793277396000}}};
  const nested=__make('nested',{messageTime:1793277296000});nested.__reactProps$fixture={chatMessage:{messageTime:1793277296000},children:{props:{chatMessage:{messageTime:1793277396000}}}};
  const wrong=__make('wrong-id',{msgId:'source-other',messageTime:1793277296000});wrong.dataset.messageId='native-id';
  const ambiguous=__make('ambiguous',null);ambiguous.__reactProps$fixture={children:[{props:{chatMessage:{msgId:'a',messageTime:1793277296000}}},{props:{chatMessage:{msgId:'b',messageTime:1793277396000}}}]};
  const wrapper=document.createElement('div');wrapper.className='_item_fixture';const inner=__make('inner',null);delete inner.__reactProps$fixture;wrapper.__reactProps$fixture={children:{props:{chatMessage:{messageTime:1793277296000}}}};inner.before(wrapper);wrapper.append(inner);
  const neighbor=__make('neighbor',null);delete neighbor.__reactProps$fixture;neighbor.__reactFiber$fixture={child:{stateNode:document.querySelector('#no-profile'),memoizedProps:{chatMessage:{messageTime:1793277396000,profile:{nickname:'화면에 보이는 이름·배지'},content:'화면 본문'}}}};
  const cached=__make('cached',{msgId:'stable',messageTime:1793277296000});cached.dataset.messageId='stable';
 });
 await page.addScriptTag({content:fs.readFileSync('src/content/chat-metadata-main.js','utf8')});
 const original='2026-10-29T12:34:56.000Z';
 await page.waitForFunction(()=>document.querySelector('#cached').getAttribute('data-cz-message-time')==='2026-10-29T12:34:56.000Z');
 for(const id of ['no-profile','segments','getter','time-only','nested','inner','cached'])assert.equal(await page.locator('#'+id).getAttribute('data-cz-message-time'),original,id);
 for(const id of ['wrong-id','ambiguous','neighbor'])assert.equal(await page.locator('#'+id).getAttribute('data-cz-message-time'),null,id);
 assert.equal(await page.evaluate(()=>!!window.__unexpectedGetter),false);
 // Stable ID survives missing transient fields, new source instances and remounts.
 await page.evaluate(()=>{const row=document.querySelector('#cached');row.__reactProps$fixture={chatMessage:{msgId:'stable'}};row.querySelector('[data-chat-text]').textContent='이모티콘 로딩 후 변경';});
 await page.waitForTimeout(60);assert.equal(await page.locator('#cached').getAttribute('data-cz-message-time'),original);
 await page.evaluate(()=>{const old=document.querySelector('#cached'),row=old.cloneNode(true);row.removeAttribute('data-cz-message-time');row.__reactProps$fixture={chatMessage:{msgId:'stable',messageTime:1793277396000}};old.replaceWith(row);});
 await page.waitForFunction(()=>document.querySelector('#cached').hasAttribute('data-cz-message-time'));assert.equal(await page.locator('#cached').getAttribute('data-cz-message-time'),original);
 // Recycled row with a new message ID must take the new authored time.
 await page.evaluate(()=>{const row=document.querySelector('#cached');row.dataset.messageId='next';row.__reactProps$fixture={chatMessage:{msgId:'next',messageTime:1793277396000}};});
 await page.waitForFunction(()=>document.querySelector('#cached').getAttribute('data-cz-message-time')==='2026-10-29T12:36:36.000Z');
 await page.evaluate(()=>{document.documentElement.setAttribute('data-cz-timestamps-enabled','false');document.dispatchEvent(new Event('cz-chat-timestamps-config'));});
 assert.equal(await page.locator('[data-cz-message-time]').count(),0);
 await page.evaluate(()=>{document.querySelector('#cached').__reactProps$fixture={chatMessage:{msgId:'next',messageTime:1793277496000}};document.documentElement.setAttribute('data-cz-timestamps-enabled','true');document.dispatchEvent(new Event('cz-chat-timestamps-config'));});
 await page.waitForFunction(()=>document.querySelector('#cached').getAttribute('data-cz-message-time')==='2026-10-29T12:38:16.000Z');
 console.log('PASS: row-owned source time independent of author/body, wrappers, guarded getters, conflicting IDs, neighboring rows, stable IDs, recycling and OFF cleanup.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
