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
  const fields = await row.evaluate((el, p) => ['name', 'category', 'meta'].map(part => {
    const field = el.querySelector(`.${p}-${part}`), box = field.getBoundingClientRect();
    return {text: field.textContent, top: box.top, bottom: box.bottom, left: box.left, right: box.right};
  }), prefix);
  assert(Math.max(...fields.map(f => f.top)) < Math.min(...fields.map(f => f.bottom)), 'favorite fields must share one line');
  assert(fields[0].right <= fields[1].left && fields[1].right <= fields[2].left);
  assert(fields[1].left - fields[0].right <= 5 && fields[2].left - fields[1].right <= 5, 'fields must stay close together');
  const badge = row.locator('.online-badge, .offline-badge, .favorite-online-badge');
  assert.equal(await badge.evaluate(el => getComputedStyle(el).display), 'none');
  assert(fields[2].text === '--' || /^\d{2,}:\d{2}$/.test(fields[2].text));
}

async function run() {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/lib/chromium/chromium', headless: true, args: ['--no-sandbox']});
  try {
    const context = await browser.newContext();
    context.setDefaultTimeout(10000);
    const errors = [];
    const storage = {
      chzzkMultiviewFavoritesV08: [
        {uid: 'aaaaaa', name: '방송 A', group: '첫 그룹', order: 1},
        {uid: 'bbbbbb', name: '방송 B', group: '둘째 그룹', order: 2}
      ],
      chzzkMultiviewFavoriteGroupsV02: ['기본 그룹', '첫 그룹', '둘째 그룹', '빈 그룹']
    };
    let writes = 0;
    let liveStatus = 'OPEN';
    let liveGate = null;
    let notifyLiveGate = null;
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
      window.__storageListeners = [];
      window.__messageListeners = [];
      window.chrome = {
        runtime: {id: 'mock-extension', getManifest: () => ({version}), sendMessage: async () => ({ok: true}), onMessage: {addListener: f => window.__messageListeners.push(f)}},
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
      if (url.host === 'popup.invalid') {
        const file = path.basename(url.pathname);
        return route.fulfill({body: fs.readFileSync(path.join(root, file)), contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'});
      }
      if (url.host === 'api.chzzk.naver.com') {
        if (url.pathname.endsWith('/live-detail') && liveGate) { notifyLiveGate?.(); await liveGate; }
        if (liveStatus === 'ERROR') return route.fulfill({status: 503, body: 'unavailable'});
        return route.fulfill({json: {code: 200, content: {status: liveStatus, openDate: '2026-10-11 09:00:00', liveCategoryValue: '게임', channel: {channelName: '테스트 방송'}}}});
      }
      return route.fulfill({contentType: 'text/html', body: '<!doctype html><html><head><title>CHZZK fixture</title></head><body></body></html>'});
    });
    const popup = await context.newPage();
    popup.on('pageerror', e => errors.push(e.message));
    await popup.goto('https://popup.invalid/popup.html');
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

    const main = await context.newPage();
    main.on('pageerror', e => errors.push(e.message));
    await main.goto('https://chzzk.naver.com/');
    for (const file of ['favorites-store.js', 'chzzk-page.js']) await main.addScriptTag({content: fs.readFileSync(path.join(root, file), 'utf8')});
    const opened = await main.evaluate(() => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('MultiView initialization timeout')), 10000);
      window.__messageListeners[0]({type: 'OPEN_MULTIVIEW', initialInputs: ['aaaaaa','bbbbbb']}, {}, result => { clearTimeout(timer); resolve(result); });
    }));
    assert.equal(opened.ok, true, opened.error);
    console.log('Checked MultiView initialization');
    await main.waitForFunction(() => [...document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('.tile-streamer-name')].every(el => el.textContent === '테스트 방송'));
    await main.evaluate(() => { window.__originalFrames = [...document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('#videoGrid iframe')]; });
    // Fallback injection may repeat both scripts in an already-open view.
    for (const file of ['favorites-store.js', 'chzzk-page.js']) await main.addScriptTag({content: fs.readFileSync(path.join(root, file), 'utf8')});
    await main.locator('#favoriteManager > summary').click();
    await checkCompactFavorites(main, 'favorite-list');
    await main.locator('#favoriteManageGroups').click();
    await main.locator('.favorite-manage-row[data-group="빈 그룹"]').waitFor();

    await popup.locator('#manageGroups').click();
    popup.once('dialog', dialog => dialog.accept('새 그룹'));
    await popup.locator('#groupAddFromModal').click();
    await main.locator('.favorite-manage-row[data-group="새 그룹"]').waitFor();
    popup.once('dialog', dialog => dialog.accept('변경 그룹'));
    await popup.locator('.manage-group-row[data-group="첫 그룹"] .manage-rename').click();
    await main.locator('.favorite-manage-row[data-group="변경 그룹"]').waitFor();
    assert.equal(storage.chzzkMultiviewFavoritesV08[0].group, '변경 그룹');
    await popup.locator('[data-close-modal="groups"]').click();
    await popup.locator('#manageItems').click();
    await popup.locator('.manage-item-row[data-uid="bbbbbb"] select').selectOption('변경 그룹');
    await main.locator('.favorite-list-group[data-group="변경 그룹"] .favorite-list-row[data-uid="bbbbbb"]').waitFor();
    assert.deepEqual(storage.chzzkMultiviewFavoritesV08.map(f => f.uid), ['aaaaaa','bbbbbb']);
    const dragData = await popup.evaluateHandle(() => new DataTransfer());
    const dragSource = popup.locator('.manage-item-row[data-uid="aaaaaa"]');
    const dragTarget = popup.locator('.manage-item-row[data-uid="bbbbbb"]');
    await dragSource.dispatchEvent('dragstart', {dataTransfer: dragData});
    await dragTarget.dispatchEvent('dragover', {dataTransfer: dragData});
    assert((await dragSource.getAttribute('class')).includes('favorite-dragging'));
    assert((await dragTarget.getAttribute('class')).includes('favorite-drop-target'));
    assert.equal(await dragTarget.evaluate(el => getComputedStyle(el).outlineWidth), '2px');
    await dragSource.dispatchEvent('dragend', {dataTransfer: dragData});
    await popup.locator('.manage-item-row[data-uid="aaaaaa"]').dragTo(popup.locator('.manage-item-row[data-uid="bbbbbb"]'));
    await popup.waitForFunction(() => document.querySelector('.manage-item-row')?.dataset.uid === 'bbbbbb');
    assert.deepEqual(storage.chzzkMultiviewFavoritesV08.map(f => f.uid), ['bbbbbb','aaaaaa']);
    console.log('Checked popup edits and item drag');

    // Modify from MultiView, then assert the already-open popup follows storage.
    main.once('dialog', dialog => dialog.accept());
    await main.locator('.favorite-manage-row[data-group="변경 그룹"] .favorite-manage-delete').click();
    await popup.waitForFunction(() => [...document.querySelectorAll('.manage-item-group')].every(s => s.value === '기본 그룹'));
    assert.deepEqual(storage.chzzkMultiviewFavoritesV08.map(f => f.order), [1,2]);
    assert(storage.chzzkMultiviewFavoriteGroupsV02.includes('빈 그룹'));
    await main.locator('[data-fav-close="groups"]').click();
    await main.locator('#favoriteManageItems').click();
    await main.locator('.favorite-manage-row[data-uid="aaaaaa"] .favorite-manage-delete-item').click();
    await popup.waitForFunction(() => document.querySelectorAll('.manage-item-row').length === 1);
    assert.deepEqual(storage.chzzkMultiviewFavoritesV08.map(f => f.uid), ['bbbbbb']);
    const beforeReopen = writes;
    const other = await context.newPage();
    other.on('pageerror', e => errors.push(e.message));
    await other.goto('https://popup.invalid/popup.html');
    await other.waitForFunction(() => document.querySelectorAll('.favorite-row').length === 1);
    assert.equal(writes, beforeReopen, 'reopening must not overwrite groups or cause a storage echo');
    assert(storage.chzzkMultiviewFavoriteGroupsV02.includes('새 그룹'));
    await main.locator('[data-fav-close="items"]').click();
    await main.locator('#favoriteManager > summary').click();

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

    await main.locator('#favoriteManageItems').click();
    await main.locator('.favorite-manage-row[data-uid="bbbbbb"] select').selectOption('새 그룹');
    await main.locator('.favorite-list-group[data-group="새 그룹"] .favorite-list-row[data-uid="bbbbbb"]').waitFor({state: 'attached'});
    assert((await main.locator('.mv-notice').textContent()).includes('현재 화면에만 적용'));
    assert.equal(storage.chzzkMultiviewFavoritesV08[0].group, '기본 그룹');
    await main.locator('[data-fav-close="items"]').click();

    await main.evaluate(() => { window.__invalidWrite = ''; window.__invalidRead = ''; });
    assert.equal(await main.locator('#syncManager').getAttribute('open'), null);
    let releaseLive;
    const requestStarted = new Promise(resolve => { notifyLiveGate = resolve; });
    liveGate = new Promise(resolve => { releaseLive = resolve; });
    // Start a delayed refresh, then add a favorite and edit its group/order.
    await main.locator('#favoriteRefresh').click();
    await requestStarted;
    await main.locator('#channelManager > summary').click();
    await main.locator('.channel-list-row[data-uid="aaaaaa"] .channel-list-favorite').click();
    await popup.waitForFunction(() => document.querySelectorAll('.manage-item-row').length === 2);
    await popup.locator('.manage-item-row[data-uid="aaaaaa"] select').selectOption('새 그룹');
    await popup.locator('.manage-item-row[data-uid="aaaaaa"]').dragTo(popup.locator('.manage-item-row[data-uid="bbbbbb"]'));
    await popup.waitForFunction(() => document.querySelector('.manage-item-row').dataset.uid === 'aaaaaa');
    const orderDuringRefresh = storage.chzzkMultiviewFavoritesV08.map(f => f.uid);
    releaseLive();
    liveGate = null;
    await main.waitForFunction(() => !document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('#favoriteRefresh').disabled);
    assert.deepEqual(storage.chzzkMultiviewFavoritesV08.map(f => f.uid), orderDuringRefresh);
    assert.equal(storage.chzzkMultiviewFavoritesV08.find(f => f.uid === 'aaaaaa').group, '새 그룹');
    await main.locator('.favorite-list-group[data-group="새 그룹"] .favorite-list-row[data-uid="aaaaaa"]').waitFor({state: 'attached'});
    console.log('PASS: new favorite, group assignment and drag order survive an in-flight refresh; popup-created broadcasts resolve streamer names.');
    assert.deepEqual(errors, []);
    console.log('PASS: browser DOM smoke (mock Chrome APIs/CHZZK): popup controls, two-way group/item sync, drag order, empty-group preservation, no read/write echo, retained player frames, sync UI; no runtime errors.');
    console.log('Actual extension registration, login and live playback are not tested by this harness.');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
