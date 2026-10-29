import type {SettingsDocument} from './settings-backup';
import type {BackupDocument} from './favorites-backup';
export function attach(host: HTMLElement,onRestored: () => Promise<void>,options: {settings?: boolean}={}) {
  host.innerHTML='<div class="cg-backup-actions"><button class="cg-backup-export" type="button">즐겨찾기 백업</button><button class="cg-backup-import" type="button">백업 불러오기</button><button class="cg-backup-undo" type="button">불러오기 전 목록 복구</button><input class="cg-backup-file" type="file" accept=".json,application/json" hidden></div><div class="cg-backup-preview" hidden><p class="cg-backup-summary"></p><div class="cg-backup-controls"><select class="cg-backup-mode" aria-label="즐겨찾기 불러오기 방식"><option value="merge">기존 목록에 합치기</option><option value="replace">백업으로 교체</option></select><button class="cg-backup-apply" type="button">불러오기</button><button class="cg-backup-cancel" type="button">취소</button></div></div><p class="cg-backup-status" role="status"></p>';
  const full=options.settings===true,api=full?CZSettingsBackupClient:CZFavoritesBackup;
  const $=<T extends HTMLElement>(selector: string)=>host.querySelector<T>(selector)!;
  const root=host.getRootNode() as Document | ShadowRoot;
  const status=$('.cg-backup-status'),preview=$('.cg-backup-preview'),input=$<HTMLInputElement>('.cg-backup-file');
  const mode=$<HTMLSelectElement>('.cg-backup-mode'),apply=$<HTMLButtonElement>('.cg-backup-apply');
  let pending: BackupDocument | SettingsDocument | null=null,busy=false;
  function message(text: string){const target=host.isConnected?status:root.querySelector('.cg-backup-status');if(target)target.textContent=text;}
  function count(document: BackupDocument | SettingsDocument){return document.format==='cz-control-room-settings'?document.data.favorites.data:document.data;}
  if(full){$('.cg-backup-export').textContent='설정 내보내기';$('.cg-backup-import').textContent='설정 불러오기';$('.cg-backup-undo').textContent='불러오기 전 설정 복구';mode.hidden=true;}
  function show(document: BackupDocument | SettingsDocument,previous=false){
    pending=document;preview.hidden=false;mode.value=full || previous?'replace':'merge';
    $('.cg-backup-summary').textContent=`${previous?(full?'불러오기 전 설정':'불러오기 전 목록'):'선택한 백업'}: 즐겨찾기 ${count(document).favorites.length}개 · 그룹 ${count(document).groups.length}개.${full?' 전체 설정과 목록을 교체합니다. 열린 멀티뷰는 적용 후 새로고침하세요.':' 교체를 선택하면 현재 목록을 대신합니다.'}`;
    message('아직 변경하지 않았습니다. 방식 확인 후 불러오기를 눌러주세요.');
  }
  function setBusy(value: boolean){busy=value;host.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=value);mode.disabled=value;}
  $('.cg-backup-export').onclick=async()=>{
    setBusy(true);
    try{
      const document=await api.create();
      const url=URL.createObjectURL(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}));
      try{
        const link=globalThis.document.createElement('a');link.href=url;
        link.download=`CZ-${full?'settings':'favorites'}-${new Date().toLocaleDateString('sv-SE')}.json`;
        globalThis.document.body.appendChild(link);link.click();link.remove();
      }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
      message(`즐겨찾기 ${count(document).favorites.length}개 백업 파일 다운로드를 요청했습니다.`);
    }catch(error){message(error instanceof Error?error.message:String(error));}finally{setBusy(false);}
  };
  $('.cg-backup-import').onclick=()=>{if(!busy){input.value='';input.click();}};
  input.onchange=async()=>{
    pending=null;preview.hidden=true;
    const file=input.files?.[0];if(!file)return;
    setBusy(true);
    try{
      if(file.size>api.MAX_BYTES)throw Error('백업 파일은 5MB 이하만 불러올 수 있습니다.');
      show(api.parse(JSON.parse(await file.text())));
    }catch(error){message(error instanceof SyntaxError?'JSON 파일을 확인해주세요.':error instanceof Error?error.message:String(error));}finally{setBusy(false);}
  };
  $('.cg-backup-undo').onclick=async()=>{
    setBusy(true);pending=null;preview.hidden=true;
    try{const previous=await api.previous();if(previous)show(previous,true);else message('이 확장에서 불러오기 전 자동 보관한 목록이 없습니다.');}
    catch(error){message(error instanceof Error?error.message:String(error));}finally{setBusy(false);}
  };
  $('.cg-backup-cancel').onclick=()=>{pending=null;preview.hidden=true;message('불러오기를 취소했습니다.');};
  apply.onclick=async()=>{
    if(!pending || busy)return;
    setBusy(true);
    try{
      const result=await api.restore(pending,mode.value==='replace'?'replace':'merge');
      pending=null;preview.hidden=true;
      await onRestored();
      message(`즐겨찾기 ${result.favorites.length}개를 불러왔습니다. 이전 ${full?'설정':'목록'}도 자동 보관했습니다.${full?' 열린 멀티뷰를 새로고침하면 적용됩니다.':''}`);
    }catch(error){message(error instanceof Error?error.message:String(error));}finally{setBusy(false);}
  };
}
export const favoritesBackupUI=Object.freeze({attach});
globalThis.CZFavoritesBackupUI=favoritesBackupUI;
