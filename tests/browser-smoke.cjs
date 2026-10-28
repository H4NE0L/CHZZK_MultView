// Real DOM/JavaScript in Chromium; Chrome extension APIs and CHZZK HTTP are mocked.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));

async function checkCompactFavorites(page, prefix) {
  const groupPrefix = prefix === 'favorite' ? 'favorite' : 'favorite-list';
  const nameClass = prefix === 'favorite' ? 'group-name' : 'favorite-list-group-name';
  const empty = page.locator(`.${groupPrefix}-group[data-group="빈 그룹"]`);
  assert.equal(await empty.locator(`.${groupPrefix}-group-count`).textContent(), '(0)');
  const group = page.locator(`.${groupPrefix}-group`).filter({has: page.locator(`.${prefix}-row`)}).first();
  await group.evaluate(el => { el.open = true; });
  const countGap = await group.evaluate((el, cls) => {
    const name = el.querySelector(`.${cls}`).getBoundingClientRect();
    const count = el.querySelector('[class$="group-count"]').getBoundingClientRect();
    return count.left - name.right;
  }, nameClass);
  assert(countGap >= 0 && countGap <= 12, 'count must sit beside the group name');
  const row = group.locator(`.${prefix}-row`).first();
  if (await row.evaluate(el => el.classList.contains('offline'))) {
    for (const part of ['category', 'meta', 'viewers']) assert.equal(await row.locator(`.${prefix}-${part}`).evaluate(el => getComputedStyle(el).display), 'none');
    assert(await row.locator(`.${prefix}-name`).isVisible());
    assert(await row.locator(prefix === 'favorite' ? '.favorite-status' : '.favorite-status-dot').isVisible());
    return;
  }
  const fields = await row.evaluate((el, p) => ['identity', 'meta', 'viewers', 'name', 'category'].map(part => {
    const field = el.querySelector(`.${p}-${part}`), box = field.getBoundingClientRect();
    return {text: field.textContent, top: box.top, bottom: box.bottom, left: box.left, right: box.right};
  }), prefix);
  assert(Math.max(...fields.slice(0,3).map(f => f.top)) < Math.min(...fields.slice(0,3).map(f => f.bottom)), 'three columns share one row');
  assert(Math.max(fields[3].top, fields[4].top) < Math.min(fields[3].bottom, fields[4].bottom) && fields[3].right <= fields[4].left, 'category sits beside streamer name');
  assert(Math.abs(fields[4].left - fields[3].right - 4) <= 1, 'category has a 4px gap beside name');
  assert(Math.abs(fields[2].left - fields[1].right - 12) <= 1, 'duration and viewers have a 12px gap');
  const dotGap = await row.evaluate((el, p) => { const dot = el.querySelector(p === 'favorite' ? '.favorite-status' : '.favorite-status-dot').getBoundingClientRect(); const name = el.querySelector(`.${p}-name`).getBoundingClientRect(); return name.left - dot.right; }, prefix);
  assert(Math.abs(dotGap - 8) <= 1, 'dot and name have an 8px gap');
  assert.equal(await row.locator(`.${prefix}-name`).evaluate(el => getComputedStyle(el).fontSize), '14px');
  assert.equal(await row.locator(`.${prefix}-category`).evaluate(el => getComputedStyle(el).fontSize), '10px');
  for (const part of ['meta', 'viewers']) assert.equal(await row.locator(`.${prefix}-${part}`).evaluate(el => getComputedStyle(el).fontSize), '12px');
  assert(fields[0].right <= fields[1].left && fields[1].right <= fields[2].left, 'duration column precedes viewers');
  for (const part of ['viewers', 'meta']) {
    assert(await row.locator(`.${prefix}-${part}`).evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'viewer and duration columns must fit their content');
    assert.equal(await row.locator(`.${prefix}-${part}`).evaluate(el => getComputedStyle(el).whiteSpace), 'nowrap');
  }
  assert(await row.locator(`.${prefix}-text`).evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'favorite columns must fit the panel');
  assert.equal(await row.locator(`.${prefix}-viewers .viewer-icon`).count(), 1);
  assert.equal(await row.locator(`.${prefix}-category`).evaluate(el => getComputedStyle(el).color), 'rgb(0, 220, 155)');
  assert.equal(await row.locator(`.${prefix}-viewers`).evaluate(el => getComputedStyle(el).color), 'rgb(255, 116, 116)');
  assert.equal(await row.locator(`.${prefix}-meta`).evaluate(el => getComputedStyle(el).textAlign), 'left');
  assert.equal(await row.locator(`.${prefix}-meta`).evaluate(el => getComputedStyle(el).fontWeight), '700');
  assert.equal(await row.locator(`.${prefix}-category`).evaluate(el => getComputedStyle(el).paddingLeft), '0px');
  assert.equal(await row.locator(`.${prefix}-viewers`).evaluate(el => getComputedStyle(el).textAlign), 'right');
  const origins = await row.evaluate((el,p) => {
    const fields=['name','category','meta','viewers'].map(part => el.querySelector(`.${p}-${part}`));
    const before=fields.map(f => f.getBoundingClientRect().left), original=fields.slice(0,2).map(f=>f.textContent);
    fields[0].textContent='아주 긴 방송인 이름 길이 변경'; fields[1].textContent='짧음';
    const after=fields.map(f => f.getBoundingClientRect().left);
    fields.slice(0,2).forEach((f,i)=>f.textContent=original[i]);
    return {before,after};
  },prefix);
  assert.deepEqual(origins.before,origins.after,'information column origins must not depend on text length');
  const badge = row.locator('.online-badge, .offline-badge, .favorite-online-badge');
  assert.equal(await badge.evaluate(el => getComputedStyle(el).display), 'none');
  assert(fields[1].text === '--' || /^\d{2,}:\d{2}:\d{2}$/.test(fields[1].text));
}

async function run() {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/lib/chromium/chromium', headless: true, args: ['--no-sandbox']});
  try {
    const context = await browser.newContext();
    context.setDefaultTimeout(10000);
    await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://viewer.invalid'});
    const errors = [];
    context.on('page', page => page.on('console', message => {
      if (/target origin provided.*does not match/.test(message.text())) errors.push(message.text());
    }));
    const storage = {
      chzzkMultiviewFavoritesV08: [
        {uid: 'aaaaaa', name: '방송 A', group: '첫 그룹', order: 1},
        {uid: 'bbbbbb', name: '방송 B', group: '둘째 그룹', order: 2}
      ],
      chzzkMultiviewFavoriteGroupsV02: ['기본 그룹', '첫 그룹', '둘째 그룹', '빈 그룹']
    };
    const externalTabs=[];
    let writes = 0;
    let liveStatus = 'OPEN';
    let followingLogin = true;
    let liveViewers = 1234;
    let liveGate = null;
    let notifyLiveGate = null;
    const resultCleanup=[];
    await context.exposeBinding('__openOriginalTab',(_source,props)=>{externalTabs.push(props);return {id:22};});
    await context.exposeBinding('__updateOriginalTab',(_source,id,props)=>{externalTabs.push({id,...props});return {id,...props};});
    await context.exposeBinding('__registerResult',async(source,message)=>{source.page.once('close',()=>{const viewer=context.pages().find(p=>p.url().includes('/src/viewer/viewer.html'));if(viewer)resultCleanup.push(viewer.evaluate(id=>CZRecordings.remove(id),message.resultId));});return {ok:true};});
    await context.exposeBinding('__createResultWindow',async(_source,url)=>{const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);return {id:2};});
    await context.exposeBinding('__storageGet', (_source, keys) => {
      const names = typeof keys === 'string' ? [keys] : keys;
      return Object.fromEntries(names.filter(k => k in storage).map(k => [k, structuredClone(storage[k])]));
    });
    await context.exposeBinding('__storageSet', async (_source, values) => {
      const changes = Object.fromEntries(Object.entries(values).map(([k,v]) => [k, {oldValue: storage[k], newValue: v}]));
      Object.assign(storage, structuredClone(values));
      writes++;
      await Promise.all(context.pages().map(p => p.evaluate(c => window.__storageListeners.forEach(f => f(c, 'local')), changes)));
    });
    await context.addInitScript(version => {
      const requestTimeout = AbortSignal.timeout.bind(AbortSignal);
      // A controlled server gate tests storage concurrency, not wall-clock time
      // spent by slow browser automation. Keep normal requests on real deadlines.
      AbortSignal.timeout = delay => window.__holdRequestTimeouts ? new AbortController().signal : requestTimeout(delay);
      window.__policyViolations = [];
      document.addEventListener('securitypolicyviolation', event => window.__policyViolations.push(event.violatedDirective));
      window.__statusPolls = [];
      const nativeInterval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => {
        if (delay === 30000) { window.__statusPolls.push(callback); return -window.__statusPolls.length; }
        return nativeInterval(callback, delay, ...args);
      };
      window.__storageListeners = [];
      window.__messageListeners = [];
      window.chrome = {
        windows: {create:args=>window.__createResultWindow(args.url)},
        tabs: {getCurrent: async () => ({id: 1}),create:props=>window.__openOriginalTab(props),update:(id,props)=>window.__updateOriginalTab(id,props)},
        runtime: {id: 'mock-extension', getURL: file => 'https://viewer.invalid/' + file, getManifest: () => ({version}), sendMessage: async message => {if(message.type==='VIEWER_SAVE_STATE')await window.__storageSet({chzzkMultiviewV09:message.state});return message.type==='REGISTER_RECORDING_RESULT'?window.__registerResult(message):({ok:true});}, onMessage: {addListener: f => window.__messageListeners.push(f)}},
        storage: {
          local: {
            get: keys => {
              if (window.__invalidRead) throw Error(window.__invalidRead);
              return window.__storageGet(keys);
            },
            set: values => {
              if (window.__invalidWrite) throw Error(window.__invalidWrite);
              return window.__storageSet(values);
            }
          },
          onChanged: {addListener: f => window.__storageListeners.push(f), removeListener: f => { window.__storageListeners = window.__storageListeners.filter(x => x !== f); }}
        }
      };
    }, manifest.version);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.host === 'popup.invalid' || url.host === 'viewer.invalid') {
        const file = url.pathname.slice(1);
        return route.fulfill({body: fs.readFileSync(path.join(root, file)), headers: {'Content-Security-Policy': manifest.content_security_policy.extension_pages}, contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'});
      }
      if (url.host === 'api.chzzk.naver.com') {
        if (url.pathname.endsWith('/followings')) {
          if (!followingLogin) return route.fulfill({status:401,json:{code:401}});
          return route.fulfill({json:{code:200,content:{totalCount:3,followingList:[
            {channel:{channelId:'aaaaaa',channelName:'테스트 방송',openLive:liveStatus==='OPEN',tags:['게임']}},
            {channel:{channelId:'bbbbbb',channelName:'테스트 방송',openLive:liveStatus==='OPEN',tags:['게임']}},
            {channel:{channelId:'cccccc',channelName:'새 팔로잉',openLive:false,tags:['음악']}}
          ]}}});
        }

        if (url.pathname.endsWith('/live-detail') && liveGate) { notifyLiveGate?.(); await liveGate; }
        if (liveStatus === 'ERROR') return route.fulfill({status: 503, body: 'unavailable'});
        if (liveStatus === 'CLOSE' && url.pathname.endsWith('/live-detail')) return route.fulfill({json:{code:200,content:null}});
        return route.fulfill({json: {code: 200, content: {status: liveStatus, openDate: '2026-10-11 09:00:00', liveCategoryValue: '게임', concurrentUserCount: liveViewers, channel: {channelName: '테스트 방송'}}}});
      }
      return route.fulfill({contentType: 'text/html', body: '<!doctype html><html><head><title>테스트 방송 - 방송 제목 - CHZZK</title></head><body><video muted></video><span class="nickname">채팅 시청자 오염 이름</span><aside style="width:260px;height:500px" class="live_chat"><div class="live_chatting_input_box" style="height:96px"><input placeholder="채팅"></div><ul><li>메시지</li></ul></aside></body></html>'});
    });
    const popup = await context.newPage();
    popup.on('pageerror', e => errors.push(e.message));
    await popup.goto('https://popup.invalid/src/popup/popup.html');
    await popup.waitForFunction(() => document.querySelectorAll('.favorite-row').length === 2);
    assert.equal(await popup.locator('#version').textContent(), `v${manifest.version}`);
    assert.equal(await popup.title(), manifest.name);
    assert.equal(await popup.locator('h1').textContent(), manifest.name);
    assert.equal(manifest.action.default_title, manifest.name);
    assert.equal(writes, 0, 'opening popup must never write favorites');
    await checkCompactFavorites(popup, 'favorite');
    console.log('Checked popup initial read and compact favorite layout');
    await popup.locator('#uidInput').fill('https://chzzk.naver.com/live/cccccc');
    await popup.locator('#addList').click();
    assert((await popup.locator('#multiList').textContent()).includes('cccccc'));
    await popup.locator('#clearList').click();
    assert(!(await popup.locator('#multiList').textContent()).includes('cccccc'));

    const buttons=await popup.locator('.open-multiview-actions button').evaluateAll(nodes=>nodes.map(node=>({top:node.getBoundingClientRect().top,fits:node.scrollWidth<=node.clientWidth})));
    assert.equal(buttons.length,2);assert.equal(buttons[0].top,buttons[1].top);assert(buttons.every(button=>button.fits));
    await popup.evaluate(()=>{window.__openRequests=[];window.__originalSend=chrome.runtime.sendMessage;window.__originalClose=window.close;window.close=()=>{};chrome.runtime.sendMessage=async message=>{if(message.type==='OPEN_MULTIVIEW_FROM_POPUP'){window.__openRequests.push(message);return {ok:true};}return window.__originalSend(message);};});
    await popup.locator('#openTab').click();await popup.locator('#open').click();
    assert.deepEqual(await popup.evaluate(()=>window.__openRequests.map(message=>message.target)),['tab','window']);
    await popup.evaluate(()=>{chrome.runtime.sendMessage=window.__originalSend;window.close=window.__originalClose;});
    console.log('PASS: popup tab/window buttons fit and send independent opening modes.');
    if(process.argv.includes('--popup-only')){assert.deepEqual(errors,[]);return;}

    const main = await context.newPage();
    main.on('pageerror', e => errors.push(e.message));
    main.on('framenavigated', async frame => {
      if (new URL(frame.url()).hostname !== 'chzzk.naver.com') return;
      try { for (const file of manifest.content_scripts[0].js) await frame.addScriptTag({content: fs.readFileSync(path.join(root, file), 'utf8')}); } catch (error) { if (!frame.isDetached()) errors.push(error.message); }
    });
    await main.goto('https://viewer.invalid/src/viewer/viewer.html?inputs=' + encodeURIComponent(JSON.stringify(['aaaaaa','bbbbbb'])));
    await main.waitForFunction(() => document.body.classList.contains('ready'));
    assert.equal(new URL(main.url()).search, '', 'launch inputs are consumed once');
    console.log('Checked MultiView initialization');
    assert.equal(await main.locator('.layout-toggle-btn[data-layout="grid"]').textContent(),'그리드');
    await main.bringToFront();await main.evaluate(()=>{document.body.tabIndex=-1;document.body.focus();});
    await main.locator('body').press('f');assert.equal(await main.locator('#favoriteManager').getAttribute('open'),'');
    await main.locator('body').press('Shift+F');assert.equal(await main.locator('#favoriteManager').getAttribute('open'),null);
    await main.locator('body').press('h');assert(await main.locator('#screenLockBtn').evaluate(el=>el.classList.contains('lock-active')));await main.locator('body').press('h');
    await main.locator('body').press('b');assert(await main.locator('#__chzzk_multiview_v09__').evaluate(el=>el.shadowRoot.querySelector('.mv-root')?.classList.contains('toolbar-collapsed') || el.shadowRoot.querySelector('.toolbar-collapsed')!==null));await main.locator('body').press('b');
    await main.locator('body').press('v');assert.equal(await main.locator('#volumeManager').getAttribute('open'),'');await main.locator('body').press('v');
    await main.locator('body').press('g');assert(await main.locator('#videoGrid').evaluate(el=>el.classList.contains('layout-main-sub')));await main.locator('body').press('g');
    await main.evaluate(()=>{window.__oldChat=document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.chat-frame');});
    await main.locator('body').press('c');assert.equal(await main.locator('#chatToggleBtn').textContent(),'채팅 열기');
    assert.equal(await main.locator('.chat-frame').count(),0);
    assert(await main.evaluate(()=>!window.__oldChat.isConnected && window.__oldChat.getAttribute('src')==='about:blank'));
    await main.locator('body').press('c');
    assert(await main.evaluate(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.chat-frame')!==window.__oldChat));
    await main.evaluate(()=>{delete window.__oldChat;});
    await main.locator('#settingsManager > summary').click();await main.locator('#shortcutsEnabled').uncheck();await main.locator('#settingsManager > summary').click();
    await main.locator('body').press('f');assert.equal(await main.locator('#favoriteManager').getAttribute('open'),null);
    await main.locator('#settingsManager > summary').click();await main.locator('#shortcutsEnabled').check();await main.locator('#settingsManager > summary').click();
    await main.locator('#uidInput').fill('');await main.locator('#uidInput').press('f');assert.equal(await main.locator('#uidInput').inputValue(),'f');assert.equal(await main.locator('#favoriteManager').getAttribute('open'),null);await main.locator('#uidInput').fill('');
    console.log('PASS: general shortcut actions, uppercase keys and persisted setting toggle.');
    await main.locator('body').click({position:{x:5,y:5}});
    await require('./audio-isolation-browser-helpers.cjs')(main);
    await require('./important-chat-browser-helpers.cjs')(main);

    await main.waitForFunction(() => [...document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('.tile-streamer-name')].every(el => el.textContent === '테스트 방송'));
    await main.evaluate(() => { window.__originalFrames = [...document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('#videoGrid iframe')]; });
    assert.equal(await main.locator('.tile-refresh').count(),0);
    assert.equal(await main.locator('.tile-head').first().evaluate(el => getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    await main.locator('#favoriteManager > summary').click();
    await checkCompactFavorites(main, 'favorite-list');
    await main.locator('#channelManager > summary').click();
    assert.equal(await main.locator('.channel-list-index.is-main').count(),1);
    assert.equal(await main.locator('.channel-list-name .channel-list-main').count(),0);
    assert.equal(await main.locator('.channel-list-index.is-main').evaluate(el => getComputedStyle(el).borderRadius),'50%');
    await main.locator('#channelManager > summary').click();
    await main.locator('#favoriteManager').evaluate(el => {el.open=true;});
    await main.locator('#favoriteManageGroups').click();
    await main.locator('.cg-group[data-group="빈 그룹"]').waitFor();
    assert.equal(await popup.locator('#manageItems').count(),0);
    assert.equal(await main.locator('#favoriteManageItems').count(),0);
    await popup.locator('#manageGroups').click();
    assert(await popup.locator('.cg-toolbar').evaluate(el => {const help=el.querySelector('.cg-help').getBoundingClientRect(),button=el.querySelector('.cg-add').getBoundingClientRect();return Math.max(help.top,button.top)<Math.min(help.bottom,button.bottom);}));
    await popup.locator('.cg-add').click();
    await popup.locator('.cg-name').fill('새 그룹');
    assert.equal(await popup.locator('.cg-offline').count(),0);
    await popup.locator('.cg-refresh').click();
    await popup.locator('.cg-picker input[value="cccccc"]').waitFor();
    await popup.locator('.cg-search').fill('#음악');
    assert.equal(await popup.locator('.cg-channel').count(),0);
    await popup.locator('.cg-search').fill('새 팔로잉');
    assert.equal(await popup.locator('.cg-channel').count(),1);
    await popup.locator('.cg-select-results').click();
    await popup.locator('.cg-search').fill('');
    await popup.locator('.cg-picker input[value="aaaaaa"]').check();
    assert((await popup.locator('.cg-count').textContent()).includes('2개 선택'));
    await popup.locator('.cg-save').click();
    await main.locator('.cg-group[data-group="새 그룹"]').waitFor();
    assert(storage.chzzkMultiviewFavoritesV08.find(f => f.uid==='aaaaaa').groups.includes('첫 그룹'));
    assert(storage.chzzkMultiviewFavoritesV08.find(f => f.uid==='aaaaaa').groups.includes('새 그룹'));
    assert(storage.chzzkMultiviewFavoritesV08.find(f => f.uid==='cccccc').groups.includes('새 그룹'));
    await popup.locator('.cg-group[data-group="새 그룹"] [data-action="up"]').click();
    await popup.waitForFunction(() => [...document.querySelectorAll('.cg-group')].at(-2)?.dataset.group === '새 그룹');
    await main.locator('.cg-group[data-group="첫 그룹"] [data-action="edit"]').click();
    await main.locator('.cg-name').fill('변경 그룹');
    if (process.env.SMOKE_SCREENSHOT) await main.screenshot({path:process.env.SMOKE_SCREENSHOT});
    await main.locator('.cg-save').click();
    await popup.locator('.cg-group[data-group="변경 그룹"]').waitFor();
    assert.equal(storage.chzzkMultiviewFavoritesV08[0].group,'변경 그룹');
    main.once('dialog', dialog => dialog.accept());
    await main.locator('.cg-group[data-group="변경 그룹"] [data-action="delete"]').click();
    await popup.waitForFunction(() => !document.querySelector('.cg-group[data-group="변경 그룹"]'));
    assert(storage.chzzkMultiviewFavoritesV08.find(f=>f.uid==='aaaaaa').groups.includes('새 그룹'));
    await popup.locator('.cg-close').click();
    await main.locator('.cg-close').click();
    // Remove test-added favorite C using actual channel controls, then preserve A/B frames.
    await main.locator('.favorite-list-group[data-group="새 그룹"] .favorite-list-row[data-uid="cccccc"] .favorite-list-add').click();
    await main.locator('#channelManager > summary').click();
    await main.locator('.channel-list-row[data-uid="cccccc"] .channel-list-favorite').click();
    await main.locator('.video-tile[data-uid="cccccc"] .remove-btn').click();
    await main.locator('.channel-list-row[data-uid="aaaaaa"] .channel-list-favorite').click();
    await main.locator('#channelManager > summary').click();
    await popup.waitForFunction(() => document.querySelectorAll('.favorite-row').length===1);
    assert.deepEqual(storage.chzzkMultiviewFavoritesV08.map(f=>f.uid),['bbbbbb']);
    const beforeReopen = writes;
    const other = await context.newPage();
    other.on('pageerror', e=>errors.push(e.message));
    await other.goto('https://popup.invalid/src/popup/popup.html');
    await other.waitForFunction(() => document.querySelectorAll('.favorite-row').length===1);
    assert.equal(writes,beforeReopen,'reopening must not echo writes');
    assert(storage.chzzkMultiviewFavoriteGroupsV02.includes('새 그룹'));
    // Following is left of favorites in viewer, below favorites in popup, collapsed by default.
    assert.equal(await popup.locator('#followingManager').getAttribute('open'),null);
    const placed = await popup.evaluate(() => document.querySelector('#followingManager').getBoundingClientRect().top >= document.querySelector('#favorites').getBoundingClientRect().bottom);
    assert(placed);
    assert(await main.evaluate(() => {const root=document.querySelector('#__chzzk_multiview_v09__').shadowRoot; return root.querySelector('#followingManager').getBoundingClientRect().left < root.querySelector('#favoriteManager').getBoundingClientRect().left;}));
    await popup.locator('#followingManager > summary').click();
    await popup.locator('.cf-row.online[data-uid="aaaaaa"]').waitFor();
    const followingColumns = await popup.locator('.cf-row').evaluateAll(rows => {
      rows[0].querySelector('.cf-name').textContent='긴 방송인 이름 테스트';
      rows[1].querySelector('.cf-name').textContent='짧음';
      return rows.map(row => ['cf-name','cf-info'].map(cls => row.querySelector('.'+cls).getBoundingClientRect().left));
    });
    assert.deepEqual(followingColumns[0],followingColumns[1]);
    assert.equal(await popup.locator('.cf-star').first().evaluate(el => getComputedStyle(el).fontSize),'16px');
    await popup.locator('.cf-search').fill('새 팔로잉');
    assert.equal(await popup.locator('.cf-row').count(),0);
    assert.equal(await popup.locator('.cf-row.offline').count(),0);
    await popup.locator('.cf-search').fill('');
    const star = popup.locator('.cf-row[data-uid="aaaaaa"] .cf-star');
    await star.click();
    await popup.waitForFunction(() => document.querySelector('.cf-row[data-uid="aaaaaa"] .cf-star').getAttribute('aria-pressed')==='true');
    await star.click();
    await popup.waitForFunction(() => document.querySelector('.cf-row[data-uid="aaaaaa"] .cf-star').getAttribute('aria-pressed')==='false');
    assert.equal(await main.locator('.chat-head').count(),0);
    followingLogin=false;
    await popup.locator('.cf-refresh').click();
    await popup.waitForFunction(() => document.querySelector('.cf-status').textContent.includes('로그인'));
    assert.equal(storage.chzzkFollowingCacheV2.channels.length,3,'failed login must retain previous following cache');
    followingLogin=true;
    await popup.locator('#followingManager > summary').click();
    console.log('PASS: following placement, collapse/search, login failures, checklist group creation, multiple memberships and group ordering.');

    // The same player frame elements must survive favorite edits and main changes.
    await main.locator('#videoGrid .main-btn').nth(1).click();
    assert(await main.evaluate(() => {
      const frames = [...document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('#videoGrid iframe')];
      return frames.length === 2 && frames.every((f,i) => f === window.__originalFrames[i]);
    }));
    await main.locator('#syncManager > summary').click();
    await main.locator('#syncList .sync-row').first().waitFor();
    assert.equal(await main.locator('#syncList .sync-row').count(), 2);
    assert.equal(await main.locator('#syncResetAll').count(), 1);

    await main.locator('#favoriteManager > summary').click();
    liveStatus = 'CLOSE';
    await main.locator('#favoriteRefresh').click();
    await main.locator('.favorite-list-row[data-uid="bbbbbb"] .favorite-online-badge.offline').waitFor({state: 'attached'});
    assert.equal(storage.chzzkMultiviewFavoritesV08[0].online, false);
    await checkCompactFavorites(main, 'favorite-list');
    await checkCompactFavorites(popup, 'favorite');
    const storedBeforeFailure = structuredClone(storage);
    const writesBeforeFailure = writes;
    await main.evaluate(() => {
      window.__invalidRead = 'Extension context invalidated.';
      window.__invalidWrite = 'Extension context invalidated.';
    });
    liveStatus = 'OPEN';
    await main.locator('#favoriteRefresh').click();
    await main.locator('.favorite-list-row[data-uid="bbbbbb"] .favorite-online-badge.online').waitFor({state: 'attached'});
    await checkCompactFavorites(main, 'favorite-list');
    assert.equal(await main.locator('.favorite-list-row[data-uid="bbbbbb"] .favorite-list-viewers').textContent(), '1,234');
    assert((await main.locator('.mv-notice').textContent()).includes('현재 화면의 온라인 상태를 갱신'));
    assert.equal(writes, writesBeforeFailure);
    assert.deepEqual(storage, storedBeforeFailure, 'expired context must not overwrite the shared store');
    assert(await main.evaluate(() => [...document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('#videoGrid iframe')].every((f,i) => f === window.__originalFrames[i])));

    // A real HTTP failure must retain displayed status rather than mark it offline.
    liveStatus = 'ERROR';
    await main.locator('#favoriteRefresh').click();
    await main.waitForFunction(() => document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.mv-notice').textContent.includes('실패했습니다'));
    assert.equal(await main.locator('.favorite-list-row[data-uid="bbbbbb"] .favorite-online-badge.online').count(), 1);
    assert.equal(writes, writesBeforeFailure);

    // Storage errors other than context expiration must not silently use cached data.
    await main.evaluate(() => { window.__invalidRead = 'storage unavailable'; });
    liveStatus = 'CLOSE';
    await main.locator('#favoriteRefresh').click();
    await main.waitForFunction(() => !document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('#favoriteRefresh').disabled);
    assert.equal(await main.locator('.favorite-list-row[data-uid="bbbbbb"] .favorite-online-badge.online').count(), 1);

    // Context invalidation after reading, during the eventual write, also keeps UI usable.
    await main.evaluate(() => { window.__invalidRead = ''; });
    liveStatus = 'OPEN';
    await main.locator('#favoriteRefresh').click();
    await main.waitForFunction(() => !document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('#favoriteRefresh').disabled);
    assert.equal(await main.locator('.favorite-list-row[data-uid="bbbbbb"] .favorite-online-badge.online').count(), 1);
    assert.equal(writes, writesBeforeFailure);
    console.log('PASS: refresh OFFLINE→ONLINE on the same screen with invalidated storage, retained frames/store, write-time invalidation, and truthful network/storage failures.');

    await main.evaluate(() => { window.__invalidWrite = ''; window.__invalidRead = ''; });
    await main.locator('#favoriteManageGroups').click();
    await main.locator('.cg-close').click();
    assert.equal(await main.locator('#syncManager').getAttribute('open'), null);
    let releaseLive;
    const requestStarted = new Promise(resolve => { notifyLiveGate = resolve; });
    liveGate = new Promise(resolve => { releaseLive = resolve; });
    // Start a delayed refresh, then add a favorite and edit its group/order.
    await main.evaluate(() => {window.__holdRequestTimeouts = true;});
    await popup.evaluate(() => {window.__holdRequestTimeouts = true;});
    await main.locator('#favoriteRefresh').click();
    await requestStarted;
    await main.locator('#channelManager > summary').click();
    await main.locator('.channel-list-row[data-uid="aaaaaa"] .channel-list-favorite').click();
    await popup.locator('#manageGroups').click();
    await popup.locator('.cg-group[data-group="새 그룹"] [data-action="edit"]').click();
    await popup.locator('.cg-picker input[value="aaaaaa"]').check();
    await popup.locator('.cg-save').click();
    await popup.locator('.cg-close').click();
    const orderDuringRefresh = storage.chzzkMultiviewFavoritesV08.map(f => f.uid);
    releaseLive();
    liveGate = null;
    await main.evaluate(() => {window.__holdRequestTimeouts = false;});
    await popup.evaluate(() => {window.__holdRequestTimeouts = false;});
    await main.waitForFunction(() => !document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('#favoriteRefresh').disabled);
    assert.deepEqual(storage.chzzkMultiviewFavoritesV08.map(f => f.uid), orderDuringRefresh);
    assert(storage.chzzkMultiviewFavoritesV08.find(f => f.uid === 'aaaaaa').groups.includes('새 그룹'));
    await main.locator('.favorite-list-group[data-group="새 그룹"] .favorite-list-row[data-uid="aaaaaa"]').waitFor({state: 'attached'});
    console.log('PASS: new favorite, group assignment and stable item order survive an in-flight refresh; popup-created broadcasts resolve streamer names.');
    await main.evaluate(() => { window.__invalidRead = null; window.__invalidWrite = null; });
    const timeBefore = await main.locator('.favorite-list-row.online .favorite-list-meta').first().textContent();
    await main.waitForFunction(old => document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.favorite-list-row.online .favorite-list-meta')?.textContent !== old, timeBefore);
    liveStatus = 'CLOSE';
    assert.equal(await main.evaluate(() => window.__statusPolls.length), 1);
    await main.evaluate(() => window.__statusPolls[0]());
    await main.waitForFunction(() => [...document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('.favorite-list-row')].every(row => row.classList.contains('offline')));
    await checkCompactFavorites(main, 'favorite-list');
    await checkCompactFavorites(popup, 'favorite');
    liveStatus = 'OPEN';
    assert.equal(await popup.evaluate(() => window.__statusPolls.length), 1);
    liveViewers = 1234567;
    await popup.evaluate(() => window.__statusPolls[0]());
    await checkCompactFavorites(popup, 'favorite');
    console.log('PASS: one-second elapsed time, 30-second status polling, offline-only names and inline category, content-sized time/viewer columns and viewer icon.');
    // Real foreign-origin iframe helpers must report native-player changes.
    await main.evaluate(() => document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('.mv-toolbar details').forEach(el => el.open = false));
    const liveFrames = main.frames().filter(frame => /^\/live\/(aaaaaa|bbbbbb)$/.test(new URL(frame.url()).pathname));
    assert.equal(liveFrames.length, 2);
    for (const frame of liveFrames) await frame.evaluate(() => { window.parent.postMessage({source:'chzzk-multiview',type:'CHANNEL_INFO',uid:location.pathname.split('/').pop(),channelName:'채팅 시청자 오염 이름'},'https://viewer.invalid'); const button=document.createElement('button');button.className='native-player-control-test';button.textContent='테스트 음소거 해제';button.onclick=()=>{document.querySelector('video').muted=false;};document.body.appendChild(button); });
    for(const frame of liveFrames)await frame.locator('.native-player-control-test').click({force:true});
    await main.waitForFunction(() => [...document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('.tile-volume-row .tile-mute-btn')].every(el => el.dataset.state === 'u'));
    const survivor = main.frames().find(frame => new URL(frame.url()).pathname === '/live/bbbbbb');
    await main.locator('#videoGrid .video-tile[data-uid="aaaaaa"] .remove-btn').click();
    assert.equal(await survivor.evaluate(() => document.querySelector('video').muted), false);
    assert(await main.evaluate(() => document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('#videoGrid iframe') === window.__originalFrames[1]));
    // Unrelated windows cannot impersonate a player UID.
    await main.evaluate(() => window.dispatchEvent(new MessageEvent('message', {origin:'https://chzzk.naver.com', source:window, data:{source:'chzzk-multiview',type:'VIDEO_STATE',uid:'bbbbbb',reason:'player',muted:true,volume:0}})));
    assert.equal(await survivor.evaluate(() => document.querySelector('video').muted), false);
    await main.locator('#volumeManager > summary').click();
    const setRange = async (selector, value) => main.locator(selector).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); }, value);
    await setRange('#masterVolume', '50');
    await setRange('.tile-volume-row[data-uid="bbbbbb"] input', '60');
    await main.locator('#mainOnlyCheck').check();
    await main.locator('#volumeManager > summary').click();
    await main.locator('.layout-toggle-btn[data-layout="main-sub"]').click();
    await main.waitForFunction(() => document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('#videoGrid').classList.contains('layout-main-sub'));
    assert.equal(storage.chzzkMultiviewV09.layout, 'main-sub');
    assert.equal(storage.chzzkMultiviewV09.channels[0].volume, .6);
    assert.equal(storage.chzzkMultiviewV09.channels[0].muted, false);
    await main.reload();
    await main.waitForFunction(() => document.body.classList.contains('ready'));
    assert.equal(main.url(), 'https://viewer.invalid/src/viewer/viewer.html');
    assert.equal(await main.locator('#videoGrid .video-tile').count(), 1);
    assert.equal(await main.locator('#masterVolume').inputValue(), '50');
    assert.equal(await main.locator('.tile-volume-row input').inputValue(), '10');
    assert(await main.locator('#mainOnlyCheck').isChecked());
    assert(await main.locator('#videoGrid').evaluate(el => el.classList.contains('layout-main-sub')));
    await main.waitForFunction(() => document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.tile-mute-btn[data-state="m"]')?.classList.contains('is-muted'));
    const restored = main.frames().find(frame => new URL(frame.url()).pathname === '/live/bbbbbb');
    await restored.waitForFunction(() => document.querySelector('video')?.dataset.chzzkMvBound === '1' && Math.abs(document.querySelector('video').volume - .05)<.001 && document.querySelector('video').muted);
    console.log('PASS: native-player unmute survives unrelated tile deletion; reload preserves session/layout/master volume and resets tile audio to muted 10%.');
    // Replace the popup list in place, retaining the existing broadcaster iframe.
    await main.evaluate(() => { window.__retainedFrame = document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('#videoGrid iframe'); });
    const routed = await main.evaluate(() => new Promise(resolve => window.__messageListeners[0]({type:'VIEWER_SET_INPUTS',tabId:1,initialInputs:['video/12345678','bbbbbb']}, {id:'mock-extension'}, resolve)));
    assert.equal(routed.ok,true);
    assert(await main.evaluate(() => document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.video-tile[data-uid="bbbbbb"] iframe') === window.__retainedFrame));
    await main.locator('.video-tile[data-uid="video:12345678"] .main-btn').click();
    await main.waitForFunction(() => document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.chat-frame')?.src.includes('/video/12345678?multiview=chat'));
    let replayChat;
    for (let attempt = 0; attempt < 50; attempt++) {
      replayChat = main.frames().find(frame => frame.url().includes('/video/12345678?multiview=chat'));
      if (replayChat) break;
      await main.waitForTimeout(50);
    }
    assert(replayChat);
    await replayChat.waitForFunction(()=>document.querySelector('.live_chatting_input_box')?.getBoundingClientRect().height===46);
    await replayChat.evaluate(()=>{document.querySelector('.live_chatting_input_box').style.height='120px';});
    await replayChat.waitForFunction(()=>document.querySelector('.live_chatting_input_box').getBoundingClientRect().height===46);
    await replayChat.waitForFunction(() => document.querySelector('video')?.muted && document.querySelector('video').volume === 0 && document.querySelector('aside')?.getBoundingClientRect().width > 0);
    const replayPlayer = main.frames().find(frame => new URL(frame.url()).pathname === '/video/12345678' && !new URL(frame.url()).search);
    await replayPlayer.waitForFunction(() => document.readyState==='complete' && document.querySelector('video')?.dataset.chzzkMvBound === '1' && document.querySelector('video').volume>0 && !document.querySelector('video').muted);
    await replayPlayer.evaluate(() => {document.body.tabIndex=-1;document.body.focus();document.addEventListener('keydown',event=>{if(event.key==='m')document.querySelector('video').muted=true;});});
    await replayPlayer.locator('body').press('m');
    await main.waitForFunction(() => document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.tile-volume-row[data-uid="video:12345678"] .tile-mute-btn')?.dataset.state === 'm');
    console.log('PASS: popup-list replacement retains players; replay UID messages and cross-origin chat-only layout work.');
    // Use a real generated video stream to exercise capture and recording in Chromium.
    await replayPlayer.evaluate(()=>{
      const video=document.querySelector('video');let current=5;
      Object.defineProperty(video,'currentTime',{configurable:true,get:()=>current,set:value=>{current=value;}});
      Object.defineProperty(video,'seekable',{configurable:true,value:{length:1,start:()=>0,end:()=>30}});
      video.dispatchEvent(new Event('timeupdate'));
    });
    await main.locator('.video-tile[data-uid="video:12345678"] .media-range:not([disabled])').waitFor();
    await replayPlayer.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true})));
    await replayPlayer.waitForFunction(()=>document.querySelector('video').currentTime===2);
    await replayPlayer.evaluate(()=>{
      const input=document.querySelector('input');input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
    });
    assert.equal(await replayPlayer.evaluate(()=>document.querySelector('video').currentTime),2);
    await main.locator('.video-tile[data-uid="video:12345678"] .media-range').evaluate(el=>{el.dispatchEvent(new PointerEvent('pointerdown'));el.value=Number(el.value)+3;el.dispatchEvent(new Event('input'));});
    assert.match(await main.locator('.video-tile[data-uid="video:12345678"] .media-seek-delta').textContent(),/^\+3\.0초$/);
    await main.locator('.video-tile[data-uid="video:12345678"] .media-range').evaluate(el=>{el.value=10;el.dispatchEvent(new Event('change'));});
    await replayPlayer.waitForFunction(()=>document.querySelector('video').currentTime===10);
    await replayPlayer.evaluate(()=>{const video=document.querySelector('video');delete video.currentTime;delete video.seekable;});
    await replayPlayer.evaluate(async()=>{
      const video=document.querySelector('video'),canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
      const ctx=canvas.getContext('2d');let count=0;
      window.__paint=setInterval(()=>{ctx.fillStyle=count++%2?'#00dc9b':'#223344';ctx.fillRect(0,0,320,180);},50);
      window.__captureStream=canvas.captureStream(20);video.srcObject=window.__captureStream;await video.play();
    });
    await main.locator('.video-tile[data-uid="video:12345678"]').hover();
    await main.bringToFront();
    await main.locator('#uidInput').hover();
    assert.equal(await main.locator('.media-transport').first().evaluate(el=>getComputedStyle(el).opacity),'0');
    await main.locator('.video-tile').first().hover({position:{x:8,y:8}});
    await main.waitForFunction(()=>getComputedStyle(document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.media-transport')).opacity==='1');
    assert.equal(await main.locator('.seek-back,.seek-forward').count(),0);
    assert.equal(await main.locator('.media-transport').first().evaluate(el=>getComputedStyle(el).bottom),'60px');
    assert.equal(await main.locator('.media-transport').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    await main.locator('#settingsManager > summary').click();await main.locator('#shortcutsEnabled').uncheck();await main.locator('#settingsManager > summary').click();
    await replayPlayer.evaluate(()=>{document.body.tabIndex=-1;document.body.focus();});
    await replayPlayer.locator('body').press('s');
    await main.locator('.media-body img').waitFor();
    assert.equal((await main.locator('.gallery-crop-toggle').getAttribute('aria-pressed'))==='true',false);
    assert.equal(await main.locator('.screenshot-crop').isVisible(),false);
    const gallery=main.locator('.screenshot-gallery');await main.locator('.media-body img').evaluate(img=>img.decode());await main.bringToFront();const before=await gallery.boundingBox();
    await gallery.locator('header').hover({position:{x:30,y:15}});await main.mouse.down();await main.mouse.move(30,before.y+45,{steps:10});await main.mouse.up();
    const fullDownload=main.waitForEvent('download');await main.locator('.media-save').click();const fullBytes=fs.readFileSync(await (await fullDownload).path());assert.equal(fullBytes.readUInt32BE(16),320);assert.equal(fullBytes.readUInt32BE(20),180);
    const after=await gallery.boundingBox();assert(Math.abs(after.x-before.x)>10 || Math.abs(after.y-before.y)>10,'screenshot window can be moved');
    assert.equal(await main.locator('#chatOriginalBtn').count(),0);
    assert.equal(await main.locator('#chatSettingsBtn').count(),0);
    // Capture again while the non-modal preview is open.
    await main.evaluate(()=>{document.body.tabIndex=-1;document.body.focus();});await main.locator('body').press('s');await main.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.gallery-index').textContent==='2 / 2');
    await main.locator('.gallery-prev').click();assert.equal(await main.locator('.gallery-index').textContent(),'1 / 2');await main.locator('.media-body img').waitFor();
    await main.locator('.gallery-crop-toggle').click();
    const cropHost=main.locator('.screenshot-crop-host');const rect=await cropHost.boundingBox();
    await main.mouse.move(rect.x+rect.width*.25,rect.y+rect.height*.25);await main.mouse.down();
    await main.mouse.move(rect.x+rect.width*.75,rect.y+rect.height*.75);await main.mouse.up();
    assert.equal(await main.locator('.screenshot-crop').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(0, 220, 155)');
    await main.locator('.media-copy').click();await main.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.gallery-status').textContent==='이미지를 복사했습니다.');
    const copied=await main.evaluate(async()=>{const items=await navigator.clipboard.read();const blob=await items[0].getType('image/png');const bytes=new DataView(await blob.arrayBuffer());return [bytes.getUint32(16),bytes.getUint32(20)];});
    assert.deepEqual(copied,[160,90]);
    const imageDownload=main.waitForEvent('download');await main.locator('.media-save').click();
    const savedImage=await imageDownload;assert(/_\d{14}\.png$/.test(savedImage.suggestedFilename()));
    const imageBytes=fs.readFileSync(await savedImage.path());
    assert.equal(imageBytes.readUInt32BE(16),160);assert.equal(imageBytes.readUInt32BE(20),90);
    assert.equal(await main.locator('.screenshot-gallery').count(),1);
    await main.locator('.gallery-next').click();assert.equal((await main.locator('.gallery-crop-toggle').getAttribute('aria-pressed'))==='true',false);
    await main.locator('.gallery-prev').click();assert.equal((await main.locator('.gallery-crop-toggle').getAttribute('aria-pressed'))==='true',true);
    await main.locator('.gallery-close').click();
    await main.locator('.screenshot-gallery').waitFor({state:'detached'});
    // S in an editable field must not trigger a capture.
    await replayPlayer.evaluate(()=>document.querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'s',bubbles:true,cancelable:true})));
    assert.equal(await main.locator('.screenshot-gallery').count(),0);
    await main.locator('.video-tile[data-uid="video:12345678"] .tile-record').click();
    assert.equal(await main.locator('.media-start').count(),0);
    await main.waitForTimeout(1500);
    const resultPageEvent=context.waitForEvent('page');
    await replayPlayer.locator('body').press('r');
    const resultPage=await resultPageEvent;await resultPage.locator('#save:not([disabled])').waitFor();
    const row=await resultPage.locator('.recording-footer').evaluate(el=>[...el.querySelectorAll('label,#trim,#save')].map(field=>{const r=field.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
    assert(Math.max(...row.map(r=>r.top))<Math.min(...row.map(r=>r.bottom)),'recording controls share one row');
    await resultPage.locator('#format').selectOption({label:'WebM'});
    const recordingDownload=resultPage.waitForEvent('download');await resultPage.locator('#save').click();
    assert(/^\[\d{2}\.\d{2}\.\d{2}\][^_]+_.+\.webm$/.test((await recordingDownload).suggestedFilename()));
    await resultPage.locator('#end').fill('0.5');
    const trimDownload=resultPage.waitForEvent('download');await resultPage.locator('#trim').click();
    assert((await trimDownload).suggestedFilename().endsWith('_0-0.5s.webm'));
    await resultPage.waitForFunction(()=>!document.getElementById('trim').disabled);
    if(await resultPage.locator('#format option:not([disabled])').filter({hasText:'MP4'}).count()) {
      await resultPage.locator('#format').selectOption({label:'MP4'});
      const mp4Download=resultPage.waitForEvent('download');await resultPage.locator('#save').click();
      assert((await mp4Download).suggestedFilename().endsWith('.mp4'));
    }else console.log('MP4 export unavailable in this Chromium; WebM export remains available.');
    // Results persist independently of the opener and survive a reload.
    await resultPage.reload();await resultPage.locator('#save:not([disabled])').waitFor();
    assert.deepEqual(await resultPage.evaluate(()=>window.__policyViolations),[]);
    assert.equal(await resultPage.locator('#discard,#close').count(),0);
    const resultId=new URL(resultPage.url()).searchParams.get('id');
    await resultPage.close();await Promise.all(resultCleanup);
    assert.equal(await main.evaluate(id=>CZRecordings.get(id),resultId),undefined);
    await replayPlayer.evaluate(()=>{clearInterval(window.__paint);window.__captureStream.getTracks().forEach(t=>t.stop());});
    console.log('PASS: real generated-video screenshot preview/save, WebM recording, playback preview and trimmed clip download.');
    await main.reload();await main.waitForFunction(()=>document.body.classList.contains('ready'));assert.equal(await main.locator('#shortcutsEnabled').isChecked(),false);
    await main.evaluate(()=>{document.body.tabIndex=-1;document.body.focus();});await main.locator('body').press('f');assert.equal(await main.locator('#favoriteManager').getAttribute('open'),null);
    assert.deepEqual(await main.evaluate(() => window.__policyViolations), []);
    assert.deepEqual(await popup.evaluate(() => window.__policyViolations), []);
    assert(!storage.chzzkMultiviewFavoritesV08.some(f => /오염/.test(f.name)), 'chat nicknames must never enter favorite names');
    assert(!storage.chzzkMultiviewV09.channels.some(f => /오염/.test(f.name)), 'chat nicknames must never enter tile names');
    assert.deepEqual(errors, []);
    console.log('PASS: browser DOM smoke (mock Chrome APIs/CHZZK): popup controls, two-way group/item sync, group order, empty-group preservation, no read/write echo, retained player frames, sync UI; no runtime errors.');
    console.log('Actual extension registration, DNR application, login and live playback require Chrome verification.');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
