// One escaped two-line favorite layout shared by popup and viewer.
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function favoriteDetails(favorite){
 const name=escape(favorite.name||favorite.title||favorite.uid);
 const title=escape(favorite.online?(favorite.liveTitle||'방송 제목 확인 중'):'방송 종료');
 const category=escape(favorite.online?(favorite.category||'카테고리 없음'):'오프라인');
 const duration=escape(CZFavoritesStore.favoriteDuration(favorite));
 return `<span class="favorite-details"><span class="favorite-primary"><span class="favorite-name favorite-list-name" title="${name}">${name}</span><span class="favorite-title" title="${title}">${title}</span></span><span class="favorite-secondary"><span class="favorite-category favorite-list-category" title="${category}">${category}</span><span class="favorite-meta favorite-list-meta" title="방송 시간 (hh:mm:ss)">${duration}</span></span></span>`;
}
