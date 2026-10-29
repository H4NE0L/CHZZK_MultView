import type {BackupDocument} from './favorites-backup';
export function attach(host: HTMLElement,onRestored: () => Promise<void>) {
  host.innerHTML='<div class="cg-backup-actions"><button class="cg-backup-export" type="button">즐겨찾기 백업</button><button class="cg-backup-import" type="button">백업 불러오기</button><button class="cg-backup-undo" type="button">불러오기 전 목록 복구</button><input class="cg-backup-file" type="file" accept=".json,application/json" hidden></div><div class="cg-backup-preview" hidden><p class="cg-backup-summary"></p><div class="cg-backup-controls"><select class="cg-backup-mode" aria-label="즐겨찾기 불러오기 방식"><option value="merge">기존 목록에 합치기</option><option value="replace">백업으로 교체</option></select><button class="cg-backup-apply" type="button">불러오기</button><button class="cg-backup-cancel" type="button">취소</button></div></div><p class="cg-backup-status" role="status"></p>';
  const $=<T extends HTMLElement>(selector: string)=>host.querySelector<T>(selector)!;
  const root=host.getRootNode() as Document | ShadowRoot;
  const status=$('.cg-backup-status'),preview=$('.cg-backup-preview'),input=$<HTMLInputElement>('.cg-backup-file');
  const mode=$<HTMLSelectElement>('.cg-backup-mode'),apply=$<HTMLButtonElement>('.cg-backup-apply');
  let pending: BackupDocument | null=null,busy=false;
  function message(text: string){const target=host.isConnected?status:root.querySelector('.cg-backup-status');if(target)target.textContent=text;}
  function show(document: BackupDocument,previous=false){
    pending=document;preview.hidden=false;mode.value=previous?'replace':'merge';
    $('.cg-backup-summary').textContent=`${previous?'불러오기 전 목록':'선택한 백업'}: 즐겨찾기 ${document.data.favorites.length}개 · 그룹 ${document.data.groups.length}개. 교체를 선택하면 현재 목록을 대신합니다.`;
    message('아직 변경하지 않았습니다. 방식 확인 후 불러오기를 눌러주세요.');
  }
  function setBusy(value: boolean){busy=value;host.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=value);mode.disabled=value;}
  $('.cg-backup-export').onclick=async()=>{
    setBusy(true);
    try{
      const document=await CZFavoritesBackup.create();
      const url=URL.createObjectURL(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}));
      try{
        const link=globalThis.document.createElement('a');link.href=url;
        link.download=`CZ-favorites-${new Date().toLocaleDateString('sv-SE')}.json`;
        globalThis.document.body.appendChild(link);link.click();link.remove();
      }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
      message(`즐겨찾기 ${document.data.favorites.length}개 백업 파일 다운로드를 요청했습니다.`);
    }catch(error){message(error instanceof Error?error.message:String(error));}finally{setBusy(false);}
  };
  $('.cg-backup-import').onclick=()=>{if(!busy){input.value='';input.click();}};
  input.onchange=async()=>{
    pending=null;preview.hidden=true;
    const file=input.files?.[0];if(!file)return;
    setBusy(true);
    try{
      if(file.size>CZFavoritesBackup.MAX_BYTES)throw Error('백업 파일은 5MB 이하만 불러올 수 있습니다.');
      show(CZFavoritesBackup.parse(JSON.parse(await file.text())));
    }catch(error){message(error instanceof SyntaxError?'JSON 파일을 확인해주세요.':error instanceof Error?error.message:String(error));}finally{setBusy(false);}
  };
  $('.cg-backup-undo').onclick=async()=>{
    setBusy(true);pending=null;preview.hidden=true;
    try{const previous=await CZFavoritesBackup.previous();if(previous)show(previous,true);else message('이 확장에서 불러오기 전 자동 보관한 목록이 없습니다.');}
    catch(error){message(error instanceof Error?error.message:String(error));}finally{setBusy(false);}
  };
  $('.cg-backup-cancel').onclick=()=>{pending=null;preview.hidden=true;message('불러오기를 취소했습니다.');};
  apply.onclick=async()=>{
    if(!pending || busy)return;
    setBusy(true);
    try{
      const result=await CZFavoritesBackup.restore(pending,mode.value==='replace'?'replace':'merge');
      pending=null;preview.hidden=true;
      await onRestored();
      message(`즐겨찾기 ${result.favorites.length}개를 불러왔습니다. 이전 목록도 자동 보관했습니다.`);
    }catch(error){message(error instanceof Error?error.message:String(error));}finally{setBusy(false);}
  };
}
export const favoritesBackupUI=Object.freeze({attach});
globalThis.CZFavoritesBackupUI=favoritesBackupUI;
