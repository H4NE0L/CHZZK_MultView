globalThis.CZGroupManager = (() => {
  let options = {};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#00dc9b';
  function visibleItems(group, items) { return options[group]?.showOffline === false ? items.filter(f => f.online) : items; }
  function decorate(root) {
    root.querySelectorAll('.favorite-group, .favorite-list-group').forEach(el => {
      el.querySelector('summary').style.borderLeft = `3px solid ${color(options[el.dataset.group]?.color)}`;
    });
  }
  function attach({root, onSaved, onAdd, onOpen = () => {}}) {
    const host = root.body || root;
    let saved, following = [], query = '', selected = new Set(), currentName = null, loading = false, editor = false;
    const overlay = document.createElement('div'); overlay.className = 'cg-overlay'; overlay.hidden = true;
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label','그룹 관리');
    host.appendChild(overlay);
    const followList = root.querySelector('#followingList');
    const followDetails = root.querySelector('#followingManager');
    async function loadOptions() { options = (await chrome.storage.local.get(CZFavoritesStore.GROUP_OPTIONS_KEY))[CZFavoritesStore.GROUP_OPTIONS_KEY] || {}; decorate(root); }
    loadOptions().catch(console.warn);
    const profile = f => {
      let image = ''; try { if (new URL(f.image).protocol === 'https:') image = f.image; } catch (_) {}
      return image ? `<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="cg-avatar" aria-hidden="true">●</span>';
    };
    function renderFollowing(message = '') {
      if (!followList) return;
      if (!followList.querySelector('.cf-tools')) followList.innerHTML = `<div class="cf-tools"><input class="cf-search" type="search" placeholder="팔로잉 방송 검색" aria-label="팔로잉 방송 검색"><button class="cf-refresh" type="button">새로고침</button></div><p class="cf-status" role="status"></p><div class="cf-rows"></div>`;
      const search = followList.querySelector('.cf-search');
      if (search.value !== query) search.value = query;
      if (message) followList.querySelector('.cf-status').textContent = message;
      const rows = followList.querySelector('.cf-rows');
      const draw = () => {
        const items = following.filter(f => f.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b) => Number(b.online)-Number(a.online));
        rows.innerHTML = items.map(f => `<button type="button" class="cf-row ${f.online ? 'online':'offline'}" data-uid="${esc(f.uid)}"><span class="cf-dot" aria-hidden="true"></span><span class="cf-name">${esc(f.name)}</span>${f.online ? `<span class="cf-info">${esc(f.category || '')}</span><span class="cf-viewers"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="4" r="3"/><path d="M2 15v-2a6 6 0 0 1 12 0v2z"/></svg> ${esc(CZChzzkApi.favoriteViewerText(f))}</span><b>ONLINE</b>` : '<span class="cf-info">OFFLINE</span>'}</button>`).join('') || '<p class="cg-empty">표시할 팔로잉 방송이 없습니다.</p>';
        rows.querySelectorAll('[data-uid]').forEach(button => button.onclick = () => onAdd(following.find(f => f.uid === button.dataset.uid)));
      };
      draw();
      followList.querySelector('.cf-search').oninput = event => {query = event.target.value; draw();};
      followList.querySelector('.cf-refresh').onclick = () => refreshFollowing();
    }
    async function refreshFollowing() {
      if (loading) return; loading = true; renderFollowing('팔로잉을 불러오는 중…');
      try { const result = await CZFollowings.refresh(); following = result.channels; renderFollowing(`${following.filter(f => f.online).length}개 온라인 · 총 ${following.length}개`); if(editor) overlay.querySelector('.cg-feed-status').textContent=''; }
      catch (error) { renderFollowing(error.message); if (editor) overlay.querySelector('.cg-feed-status').textContent = error.message; }
      finally { loading = false; if (editor) renderPicker(); }
    }
    CZFollowings.read().then(result => {following = result.channels; renderFollowing(result.updatedAt ? '마지막 조회 목록' : '펼치면 팔로잉 목록을 불러옵니다.');}).catch(console.warn);
    followDetails?.addEventListener('toggle', () => {if (followDetails.open) {onOpen('following'); refreshFollowing();}});
    setInterval(() => { if (followDetails?.open) refreshFollowing(); },30000);
    async function open() { onOpen('groups'); saved = await CZFavoritesStore.read(); editor = false; overlay.hidden = false; renderGroups(); }
    function close() {overlay.hidden = true; editor = false;}
    function frame(title, actions = '') { overlay.innerHTML = `<section class="cg-dialog"><header><strong>${title}</strong><div>${actions}<button class="cg-close" type="button" aria-label="닫기">✕</button></div></header><div class="cg-body"></div></section>`; overlay.querySelector('.cg-close').onclick = close; }
    async function commit(transform, groupOptions) {
      const latest = await CZFavoritesStore.read();
      const next = transform(latest);
      saved = await CZFavoritesStore.write(next.favorites,next.groups,groupOptions);
      await onSaved(saved);
    }
    function renderGroups() {
      editor = false;
      frame('그룹 관리'); const body = overlay.querySelector('.cg-body');
      body.innerHTML = '<p class="cg-help">방송을 여러 그룹에 넣을 수 있습니다. 항목 순서 조정은 현재 보류 중입니다.</p><button class="cg-add" type="button">+ 그룹 추가</button><div class="cg-groups"></div><p class="cg-error" role="status"></p>';
      body.querySelector('.cg-add').onclick = () => openEditor(null);
      body.querySelector('.cg-groups').innerHTML = saved.groups.map((group,index) => `<div class="cg-group" data-group="${esc(group)}"><span class="cg-group-name">${esc(group)} (${CZFavoritesStore.itemsForGroup(saved.favorites,group).length})</span><button type="button" data-action="up" ${index===0?'disabled':''} aria-label="${esc(group)} 위로">↑</button><button type="button" data-action="down" ${index===saved.groups.length-1?'disabled':''} aria-label="${esc(group)} 아래로">↓</button><button type="button" data-action="edit">관리</button><button type="button" data-action="delete" ${group===CZFavoritesStore.DEFAULT_GROUP?'disabled':''}>삭제</button></div>`).join('');
      body.querySelectorAll('[data-action]').forEach(button => button.onclick = async () => {
        const group = button.closest('[data-group]').dataset.group;
        const action = button.dataset.action;
        if (action==='edit') return openEditor(group);
        if (action==='delete' && !window.confirm(`'${group}' 그룹을 삭제할까요? 다른 그룹이 없는 방송은 기본 그룹으로 이동합니다.`)) return;
        button.disabled = true;
        try {
          await commit(state => action==='delete' ? CZFavoritesStore.deleteGroup(state.favorites,state.groups,group) : CZFavoritesStore.shiftGroup(state.favorites,state.groups,group,action==='up'?-1:1));
          renderGroups();
        } catch (error) {body.querySelector('.cg-error').textContent = error.message; button.disabled = false;}
      });
    }
    async function openEditor(group) {
      saved = await CZFavoritesStore.read(); currentName = group; editor = true;
      selected = new Set(group ? CZFavoritesStore.itemsForGroup(saved.favorites,group).map(f => f.uid) : []);
      frame(group ? '그룹 편집' : '그룹 추가','<button class="cg-cancel" type="button">취소</button><button class="cg-save" type="button">저장</button>');
      const body = overlay.querySelector('.cg-body');
      body.innerHTML = `<div class="cg-fields"><label>그룹 이름<input class="cg-name" maxlength="80" value="${esc(group || '')}" ${group===CZFavoritesStore.DEFAULT_GROUP?'readonly':''} placeholder="그룹 이름"></label><label>강조색<input type="color" class="cg-color" value="${color(options[group]?.color)}"></label></div><label class="cg-offline"><input type="checkbox" ${options[group]?.showOffline !== false?'checked':''}>오프라인 방송 표시</label><div class="cg-search-row"><input type="search" class="cg-search" placeholder="팔로잉 채널명 또는 #태그 검색" aria-label="팔로잉 검색"><button class="cg-select-results" type="button">검색 결과 선택</button><button class="cg-clear" type="button">선택 해제</button></div><p class="cg-count"></p><p class="cg-feed-status cg-help" role="status"></p><p class="cg-error" role="status"></p><div class="cg-picker"></div>`;
      body.querySelector('.cg-search').oninput = renderPicker;
      body.querySelector('.cg-select-results').onclick = () => {candidates().forEach(f => selected.add(f.uid));renderPicker();};
      body.querySelector('.cg-clear').onclick = () => {selected.clear(); renderPicker();};
      overlay.querySelector('.cg-cancel').onclick = renderGroups;
      overlay.querySelector('.cg-save').onclick = async event => {
        const name = body.querySelector('.cg-name').value.trim();
        const picked = [...new Map([...saved.favorites,...following].map(f => [f.uid,f])).values()].filter(f => selected.has(f.uid));
        event.target.disabled = true;
        try {
          const prefs = (await chrome.storage.local.get(CZFavoritesStore.GROUP_OPTIONS_KEY))[CZFavoritesStore.GROUP_OPTIONS_KEY] || {};
          if (currentName && currentName!==name) delete prefs[currentName];
          Object.defineProperty(prefs,name,{enumerable:true,configurable:true,writable:true,value:{color: body.querySelector('.cg-color').value, showOffline: body.querySelector('.cg-offline input').checked}});
          await commit(state => CZFavoritesStore.setGroupMembers(state.favorites,state.groups,currentName,name,picked),prefs);
          options = prefs;
          await onSaved(saved); renderGroups();
        } catch (error) {body.querySelector('.cg-error').textContent = error.message; event.target.disabled = false;}
      };
      renderPicker(); refreshFollowing();
    }
    function candidates() {
      const search = overlay.querySelector('.cg-search')?.value.toLocaleLowerCase().replace(/^#/,'') || '';
      const retained = currentName ? CZFavoritesStore.itemsForGroup(saved.favorites,currentName) : [];
      return [...new Map([...retained,...following].map(f => [f.uid,f])).values()].filter(f => !search || `${f.name} ${f.category || ''} ${(f.tags || []).join(' ')}`.toLocaleLowerCase().includes(search));
    }
    function renderPicker() {
      if (!editor || overlay.hidden) return;
      overlay.querySelector('.cg-count').textContent = `${selected.size}개 선택${loading ? ' · 팔로잉 조회 중…':''}`;
      overlay.querySelector('.cg-picker').innerHTML = candidates().map(f => `<label class="cg-channel"><input type="checkbox" value="${esc(f.uid)}" ${selected.has(f.uid)?'checked':''}>${profile(f)}<span><strong>${esc(f.name || f.uid)}</strong><small>${esc((f.tags || []).map(t => '#'+t).join(' ') || (f.online?'ONLINE':'OFFLINE'))}</small></span></label>`).join('') || '<p class="cg-empty">검색 결과가 없습니다. 로그인과 팔로잉 목록을 확인해주세요.</p>';
      overlay.querySelectorAll('.cg-picker input').forEach(input => input.onchange = () => {if(input.checked) selected.add(input.value); else selected.delete(input.value); overlay.querySelector('.cg-count').textContent = `${selected.size}개 선택`;});
    }
    function sync() { if (!overlay.hidden && !editor) CZFavoritesStore.read().then(state => {saved = state;renderGroups();}).catch(console.warn); decorate(root); }
    chrome.storage.onChanged.addListener((changes,area) => {
      if (area!=='local') return;
      if(changes[CZFollowings.KEY]) {following = changes[CZFollowings.KEY].newValue?.channels || [];renderFollowing(); if(editor) renderPicker();}
      if(changes[CZFavoritesStore.GROUP_OPTIONS_KEY]) loadOptions().then(() => CZFavoritesStore.read()).then(state => onSaved(state)).then(sync).catch(console.warn);
    });
    overlay.addEventListener('click', event => {if(event.target===overlay) close();});
    overlay.addEventListener('keydown', event => {if(event.key==='Escape') close();});
    return {open, close, sync};
  }
  return {attach, visibleItems, decorate};
})();
