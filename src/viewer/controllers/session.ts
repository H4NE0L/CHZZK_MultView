import type {ViewerSession} from '../../shared/contracts/session';
import type {ResourceScope} from '../../shared/runtime/scope';
interface Context {readonly state: ViewerSession; scope: ResourceScope; open(inputs: unknown[]): Promise<void>}
export function create(context: Context) {
  let tabId: number | null=null,ready=false,cancelSave: (()=>void) | null=null;
  function save(): void {
    if(context.scope.isDisposed)return;
    cancelSave?.();cancelSave=null;
    try{
      if(!chrome?.runtime?.id || !chrome?.storage?.local)return;
      chrome.runtime.sendMessage({type:'VIEWER_SAVE_STATE',tabId,state:CZSessionStore.normalize(context.state)})
        .then(result=>{if(!result?.ok)throw Error(result?.error||'상태 저장 응답 없음');})
        .catch(error=>console.warn('멀티뷰 상태 저장 실패:',error));
    }catch(error){if(!String(error instanceof Error?error.message:error).includes('Extension context invalidated'))console.warn('멀티뷰 상태 저장 실패:',error);}
  }
  function saveSoon(){if(context.scope.isDisposed)return;cancelSave?.();cancelSave=context.scope.timeout(save,300);}
  async function register(siteMode: boolean){
    tabId=siteMode?(await chrome.runtime.sendMessage({type:'SITE_VIEWER_TAB'}))?.tabId:(await chrome.tabs.getCurrent())?.id??null;
    const result=await chrome.runtime.sendMessage({type:'VIEWER_REGISTER_SESSION',tabId});
    if(!result?.ok)throw Error(result?.error||'멀티뷰 저장 세션 등록 실패');
  }
  function receive(value: unknown,sender: chrome.runtime.MessageSender,reply: (value: unknown)=>void): true | void {
    if(!value || typeof value!=='object')return;
    const message=value as Record<string,unknown>;
    if(sender.id!==chrome.runtime.id || message.tabId!==tabId)return;
    if(message.type==='VIEWER_GET_STATE'){reply(ready?{ok:true,state:CZSessionStore.normalize(context.state)}:{ok:false});return;}
    if(message.type!=='VIEWER_SET_INPUTS')return;
    if(!ready){reply({ok:false});return;}
    context.open(Array.isArray(message.initialInputs)?message.initialInputs:[]).then(()=>reply({ok:true})).catch(error=>reply({ok:false,error:String(error)}));return true;
  }
  chrome.runtime.onMessage.addListener(receive);
  context.scope.add(()=>chrome.runtime.onMessage.removeListener?.(receive));
  return {get tabId(){return tabId;},get ready(){return ready;},markReady(){ready=true;},register,save,saveSoon};
}
export const viewerSession=Object.freeze({create});
globalThis.CZViewerSession=viewerSession;
