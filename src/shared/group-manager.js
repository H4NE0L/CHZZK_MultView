globalThis.CZGroupManager = (() => {
  let options = {};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#00dc9b';
  function visibleItems(group, items) { return items; }
  function decorate(root) {
    root.querySelectorAll('.favorite-group, .favorite-list-group').forEach(el => {
      el.querySelector('summary').style.borderLeft = `3px solid ${color(options[el.dataset.group]?.color)}`;
    });
  }
  function attach({root, onSaved, onAdd, onOpen = () => {}, getActiveChannels = () => []}) {
    function refreshActive() {
      const active=new Set(getActiveChannels().map(channel=>channel.uid));
      root.querySelectorAll('.favorite-list-row,.favorite-row,.cf-row').forEach(row=>{
        const used=active.has(row.dataset.uid);row.classList.toggle('in-multiview',used);
        if(used)row.setAttribute('title','멀티뷰 사용 중');else if(row.title==='멀티뷰 사용 중')row.removeAttribute('title');
      });
    }
    const host = root.body || root;
    let favoriteUids = new Set();
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
      if (!followList.querySelector('.cf-tools')) followList.innerHTML = `<div class="cf-tools"><input class="cf-search" type="search" placeholder="스트리머명·카테고리 검색" aria-label="스트리머명 또는 카테고리 검색"><button class="cf-refresh" type="button" aria-label="팔로잉 새로고침" title="팔로잉 새로고침">↻</button></div><div class="cf-rows"></div><p class="cf-status" role="status"></p>`;
      const search = followList.querySelector('.cf-search');
      if (search.value !== query) search.value = query;
      followList.querySelector('.cf-status').textContent = `${following.filter(f => f.online).length}개 온라인${message ? ' · '+message : ''}`;
      const rows = followList.querySelector('.cf-rows');
      const draw = () => {
        const items = following.filter(f => f.online && [f.name,f.category].some(value=>String(value || '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
        rows.innerHTML = items.map(f => `<div class="cf-row online" data-uid="${esc(f.uid)}"><button type="button" class="cf-main"><span class="cf-dot" aria-hidden="true"></span><span class="cf-name">${esc(f.name)}</span><span class="cf-info">${esc(f.category || '')}</span></button><button type="button" class="cf-star" aria-pressed="${favoriteUids.has(f.uid)}" aria-label="${favoriteUids.has(f.uid) ? '즐겨찾기 해제':'즐겨찾기 추가'}">${favoriteUids.has(f.uid) ? '★':'☆'}</button></div>`).join('') || '<p class="cg-empty">표시할 온라인 방송이 없습니다.</p>';
        rows.querySelectorAll('[data-uid]').forEach(row => {
          row.querySelector('.cf-main').onclick = () => onAdd(following.find(f => f.uid === row.dataset.uid));
          row.querySelector('.cf-star').onclick = async event => {
            event.target.disabled = true;
            try {
              const state = await CZFavoritesStore.read(), uid = row.dataset.uid;
              const next = state.favorites.some(f => f.uid === uid)
                ? CZFavoritesStore.removeFavorite(state.favorites,state.groups,uid)
                : CZFavoritesStore.snapshot([...state.favorites,{...following.find(f => f.uid === uid),group:CZFavoritesStore.DEFAULT_GROUP,groups:[CZFavoritesStore.DEFAULT_GROUP],order:state.favorites.length}],state.groups);
              const result = await CZFavoritesStore.write(next.favorites,next.groups);
              favoriteUids = new Set(result.favorites.map(f => f.uid));
              await onSaved(result); renderFollowing();
            } catch(error) {renderFollowing(error.message); event.target.disabled = false;}
          };
        });
        refreshActive();
      };
      draw();
      followList.querySelector('.cf-search').oninput = event => {query = event.target.value; draw();};
      followList.querySelector('.cf-refresh').onclick = () => refreshFollowing();
    }
    async function refreshFollowing() {
      if (loading) return; loading = true; renderFollowing('팔로잉을 불러오는 중…');
      try { const result = await CZFollowings.refresh(); following = result.channels; renderFollowing(); if(editor) overlay.querySelector('.cg-feed-status').textContent=''; }
      catch (error) { renderFollowing(error.message); if (editor) overlay.querySelector('.cg-feed-status').textContent = error.message; }
      finally { loading = false; if (editor) renderPicker(); }
    }
    CZFollowings.read().then(result => {following = result.channels; renderFollowing(result.updatedAt ? '마지막 조회 목록' : '↻ 버튼으로 팔로잉 목록을 불러오세요.');}).catch(console.warn);
    followDetails?.addEventListener('toggle', () => {if (followDetails.open) {onOpen('following');}});
    CZFavoritesStore.read().then(state => {favoriteUids = new Set(state.favorites.map(f => f.uid)); renderFollowing();}).catch(console.warn);
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
      body.innerHTML = '<div class="cg-toolbar"><p class="cg-help">방송을 여러 그룹에 넣을 수 있습니다.</p><div class="cg-actions"><button class="cg-add" type="button">+ 그룹 추가</button></div></div><div class="cg-groups"></div><p class="cg-error" role="status"></p>';
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
      body.innerHTML = `<div class="cg-fields"><label>그룹 이름<input class="cg-name" maxlength="80" value="${esc(group || '')}" ${group===CZFavoritesStore.DEFAULT_GROUP?'readonly':''} placeholder="그룹 이름"></label><label>강조색<input type="color" class="cg-color" value="${color(options[group]?.color)}"></label></div><div class="cg-search-row"><input type="search" class="cg-search" placeholder="팔로잉 채널명 검색" aria-label="팔로잉 검색"><button class="cg-refresh" type="button" aria-label="팔로잉 새로고침">↻</button><button class="cg-select-results" type="button">검색 결과 선택</button><button class="cg-clear" type="button">선택 해제</button></div><p class="cg-count"></p><p class="cg-feed-status cg-help" role="status"></p><p class="cg-error" role="status"></p><div class="cg-picker"></div>`;
      body.querySelector('.cg-search').oninput = renderPicker;
      body.querySelector('.cg-refresh').onclick = refreshFollowing;
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
          Object.defineProperty(prefs,name,{enumerable:true,configurable:true,writable:true,value:{color: body.querySelector('.cg-color').value, showOffline: true}});
          await commit(state => CZFavoritesStore.setGroupMembers(state.favorites,state.groups,currentName,name,picked),prefs);
          options = prefs;
          await onSaved(saved); renderGroups();
        } catch (error) {body.querySelector('.cg-error').textContent = error.message; event.target.disabled = false;}
      };
      renderPicker();
    }
    function candidates() {
      const search = overlay.querySelector('.cg-search')?.value.toLocaleLowerCase() || '';
      const retained = currentName ? CZFavoritesStore.itemsForGroup(saved.favorites,currentName) : [];
      return [...new Map([...retained,...following].map(f => [f.uid,f])).values()].filter(f => !search || String(f.name || '').toLocaleLowerCase().includes(search));
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
      if(changes[CZFavoritesStore.FAVORITES_KEY]) CZFavoritesStore.read().then(state => {favoriteUids = new Set(state.favorites.map(f => f.uid)); renderFollowing();}).catch(console.warn);
      if(changes[CZFollowings.KEY]) {following = changes[CZFollowings.KEY].newValue?.channels || [];renderFollowing(); if(editor) renderPicker();}
      if(changes[CZFavoritesStore.GROUP_OPTIONS_KEY]) loadOptions().then(() => CZFavoritesStore.read()).then(state => onSaved(state)).then(sync).catch(console.warn);
    });
    overlay.addEventListener('click', event => {if(event.target===overlay) close();});
    overlay.addEventListener('keydown', event => {if(event.key==='Escape') close();});
    return {open, close, sync, refreshActive};
  }
  return {attach, visibleItems, decorate};
})();
