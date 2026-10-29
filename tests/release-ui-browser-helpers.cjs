const assert=require('node:assert/strict');
module.exports=async page=>{
 await page.locator('#settingsManager > summary').click();
 assert.equal(await page.locator('.settings-panel > .settings-feature').first().locator('button').getAttribute('id'),'settingsBackupBtn');
 const live=page.locator('.video-tile iframe[src*="/live/"]').first();
 if(await live.count()){
  const handle=await live.elementHandle(),frame=await handle.contentFrame();await handle.dispose();
  await page.locator('#powerRewardsEnabled').check({force:true});
  await frame.waitForFunction(()=>JSON.parse(document.documentElement.getAttribute('data-cz-power-rewards')||'null')?.enabled===true);
  await page.locator('#powerRewardsEnabled').uncheck({force:true});
  await frame.waitForFunction(()=>!document.documentElement.hasAttribute('data-cz-power-rewards'));
 }
 await page.locator('#settingsManager > summary').click();
 await page.evaluate(()=>CZFavoritesStore.write([{uid:'groupcheck',name:'그룹 검사',groups:['기본 그룹']}],['기본 그룹']));
 await page.locator('#favoriteManager > summary').click();await page.locator('#favoriteManageGroups').click();
 const row=page.locator('.cg-group[data-group="기본 그룹"]');await row.waitFor();
 assert(!await row.locator('[data-action="delete"]').isDisabled());
 page.once('dialog',dialog=>dialog.accept());await row.locator('[data-action="delete"]').click();
 await row.waitFor({state:'detached'});await page.locator('.cg-close').click();
 await page.locator('.favorite-list-group[data-group=""] .favorite-list-name').filter({hasText:'그룹 검사'}).waitFor();
 const state=await page.evaluate(()=>CZFavoritesStore.read());assert.deepEqual(state.groups,[]);assert.deepEqual(state.favorites[0].groups,[]);
 assert.equal(state.favorites[0].uid,'groupcheck');
 console.log('PASS: backup setting first, reward toggle reaches live frame, populated default group can be removed without losing favorites.');
};
