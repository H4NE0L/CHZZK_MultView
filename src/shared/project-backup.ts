type Directory = FileSystemDirectoryHandle & {
  queryPermission(options: {mode: 'readwrite'}): Promise<PermissionState>;
  requestPermission(options: {mode: 'readwrite'}): Promise<PermissionState>;
};
const DATABASE='chzzk-project-backup-v1';
async function stored(mode: IDBTransactionMode,handle?: Directory): Promise<Directory | null> {
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('directory');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('directory',mode),store=transaction.objectStore('directory');
    const request=handle?store.put(handle,'project'):store.get('project');
    transaction.oncomplete=()=>{db.close();resolve(handle??request.result??null);};
    transaction.onerror=transaction.onabort=()=>{db.close();reject(transaction.error||request.error);};
  });
}
export async function choose(): Promise<Directory> {
  const picker=(window as unknown as {showDirectoryPicker?: (options: {id: string;mode: 'readwrite'})=>Promise<Directory>}).showDirectoryPicker;
  if(!picker)throw Error('이 브라우저에서는 폴더 선택을 지원하지 않습니다. 최신 Chrome에서 백업 탭을 열어주세요.');
  const handle=await picker.call(window,{id:'cz-project-backup',mode:'readwrite'});
  await handle.getDirectoryHandle('.backup',{create:true});
  await stored('readwrite',handle);return handle;
}
export async function current(): Promise<Directory | null> {return stored('readonly');}
/** Must be called from the export click before waiting for any network/state snapshot. */
export async function prepare(): Promise<(document: unknown,kind: 'favorites'|'settings')=>Promise<string>> {
  const handle=await current();
  if(!handle)throw Error('먼저 프로젝트 폴더를 선택해주세요.');
  let permission=await handle.queryPermission({mode:'readwrite'});
  if(permission!=='granted')permission=await handle.requestPermission({mode:'readwrite'});
  if(permission!=='granted')throw Error('선택한 폴더에 저장할 권한이 없습니다. 프로젝트 폴더를 다시 선택해주세요.');
  return async(document,kind)=>{
    const directory=await handle.getDirectoryHandle('.backup',{create:true});
    const date=new Date(),stamp=date.toLocaleDateString('sv-SE')+'_'+[date.getHours(),date.getMinutes(),date.getSeconds()].map(value=>String(value).padStart(2,'0')).join('');
    const filename=`CZ-${kind}-${stamp}-${crypto.randomUUID().slice(0,8)}.json`;
    let writer: FileSystemWritableFileStream | null=null;
    try{
      const file=await directory.getFileHandle(filename,{create:true});writer=await file.createWritable();
      await writer.write(JSON.stringify(document,null,2)+'\n');await writer.close();
    }catch(error){
      await writer?.abort().catch(()=>{});
      await directory.removeEntry(filename).catch(()=>{});
      throw error;
    }
    return `${handle.name}/.backup/${filename}`;
  };
}
