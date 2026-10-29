import * as projectBackup from '../shared/project-backup';
const host=document.getElementById('settingsBackup'),folder=document.getElementById('projectFolder'),button=document.getElementById('chooseProject') as HTMLButtonElement | null;
if(!host || !folder || !button)throw Error('설정 백업 화면을 찾을 수 없습니다.');
const favoriteOnly=new URL(location.href).searchParams.get('kind')==='favorites';
if(favoriteOnly){
  document.title='즐겨찾기 백업 · 치지직 통합관제실';
  document.querySelector('header strong')!.textContent='즐겨찾기 백업 / 불러오기';
  document.querySelector('.cg-body > p')!.textContent='즐겨찾기·그룹·순서·강조색을 프로젝트 폴더의 .backup에 보관합니다.';
  document.querySelector('.cg-body > .cg-help')!.textContent='불러오기는 기존 목록에 합치거나 교체할 수 있습니다. 다른 멀티뷰 설정은 변경하지 않습니다.';
}
projectBackup.current().then(handle=>{if(handle)folder.textContent=`백업 위치: ${handle.name}/.backup`;}).catch(error=>{folder.textContent=String(error);});
button.onclick=async()=>{
  button.disabled=true;
  try{const handle=await projectBackup.choose();folder.textContent=`백업 위치: ${handle.name}/.backup`;}
  catch(error){folder.textContent=error instanceof DOMException && error.name==='AbortError'?'폴더 선택을 취소했습니다.':error instanceof Error?error.message:String(error);}
  finally{button.disabled=false;}
};
CZFavoritesBackupUI.attach(host,async()=>{}, {settings:!favoriteOnly,prepareDestination:projectBackup.prepare});
