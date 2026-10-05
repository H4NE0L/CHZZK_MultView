const FAVORITES_KEY = "chzzkMultiviewFavoritesV07";
const statusEl = document.getElementById("status");
const uidInput = document.getElementById("uidInput");
const favoritesEl = document.getElementById("favorites");
const multiListEl = document.getElementById("multiList");
let favorites = [];
let multiList = [];

function setStatus(text, error = false) { statusEl.textContent = text; statusEl.style.color = error ? "#ff7070" : "#999"; }
function uidFromInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{6,}$/.test(raw)) return raw;
  try { const url = new URL(raw); const m = url.pathname.match(/^\/live\/([^/?#]+)/); return m ? m[1] : null; } catch (_) { return null; }
}
function renderFavorites() {
  favoritesEl.innerHTML = `<option value="">즐겨찾기에서 선택</option>`;
  for (const fav of favorites) { const o=document.createElement("option"); o.value=fav.uid; o.textContent=`${fav.name || fav.title || fav.uid}  ${fav.uid}`; favoritesEl.appendChild(o); }
  if (!favorites.length) favoritesEl.innerHTML = `<option value="">즐겨찾기한 방송 없음</option>`;
}
function renderList() {
  multiListEl.innerHTML = "";
  if (!multiList.length) { multiListEl.innerHTML = `<div class="list-empty">추가된 방송이 없습니다.</div>`; return; }
  multiList.forEach((item, i) => {
    const row=document.createElement("div"); row.className="multi-row";
    const text=document.createElement("div"); text.className="multi-row-text"; text.textContent=`${item.name || item.title || item.uid}  ${item.uid}`;
    const del=document.createElement("button"); del.className="row-del"; del.textContent="✕"; del.onclick=()=>{multiList.splice(i,1);renderList();};
    row.append(text,del); multiListEl.appendChild(row);
  });
}
async function loadFavorites(){ const r=await chrome.storage.local.get(FAVORITES_KEY); favorites=Array.isArray(r[FAVORITES_KEY])?r[FAVORITES_KEY]:[]; renderFavorites(); renderList(); }
async function saveFavorites(){ await chrome.storage.local.set({[FAVORITES_KEY]:favorites}); }
function addToList(value=uidInput.value){
  const uid=uidFromInput(value);
  if(!uid){setStatus("올바른 방송 URL 또는 UID를 입력해주세요.",true);uidInput.focus();return false;}
  if(!multiList.some(x=>x.uid===uid)) multiList.push({uid,name: (favorites.find(f=>f.uid===uid)?.name || favorites.find(f=>f.uid===uid)?.title || "")});
  renderList(); uidInput.value=""; uidInput.focus(); return true;
}
function removeFavorite(){const uid=favoritesEl.value;if(!uid)return;favorites=favorites.filter(f=>f.uid!==uid);saveFavorites().catch(console.warn);renderFavorites();favoritesEl.value="";setStatus("즐겨찾기에서 삭제했습니다.");}
async function sendOpenMessage(tabId, initialInputs=[], maxTries=120){
  for(let i=0;i<maxTries;i++){
    try{
      const result=await chrome.tabs.sendMessage(tabId,{type:"OPEN_MULTIVIEW",initialInputs});
      if(result?.ok!==false)return true;
    }catch(_){}
    await new Promise(r=>setTimeout(r,250));
  }
  return false;
}
async function openMultiView(){
  const current=uidFromInput(uidInput.value); if(uidInput.value.trim() && !current){setStatus("올바른 방송 URL 또는 UID를 입력해주세요.",true);return;}
  if(current) addToList(uidInput.value);

  // The popup list is temporary. If it is empty, the MultiView page can still
  // restore broadcasts saved from a previous session.
  setStatus("멀티뷰를 여는 중...");
  try {
    const result = await chrome.runtime.sendMessage({
      type: "OPEN_MULTIVIEW_FROM_POPUP",
      initialInputs: multiList.map(x=>x.uid)
    });
    if (!result?.ok) {
      setStatus("CHZZK 페이지를 열지 못했습니다.", true);
      return;
    }
    setStatus("멀티뷰를 열었습니다.");
    window.close();
  } catch (err) {
    setStatus("멀티뷰를 열지 못했습니다.", true);
  }
}
uidInput.addEventListener("keydown",e=>{if(e.key==="Enter")addToList();});
document.getElementById("addList").addEventListener("click",()=>addToList());
document.getElementById("clearList").addEventListener("click",()=>{multiList=[];renderList();});
document.getElementById("removeFavorite").addEventListener("click",removeFavorite);
favoritesEl.addEventListener("change",()=>{if(favoritesEl.value)addToList(favoritesEl.value);});
document.getElementById("open").addEventListener("click",openMultiView);
loadFavorites().catch(err=>setStatus(String(err),true));