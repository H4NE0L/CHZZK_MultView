import type {ViewerSession} from '../shared/contracts/session';
import type {ResourceScope} from '../shared/runtime/scope';
interface SettingsContext {
  root: HTMLElement;
  readonly state: ViewerSession;
  scope: ResourceScope;
  save(): void;
  syncShortcuts(): void;
  openChatSettings(): void;
  openPowerDiagnostics(): void;
}
export function bind(context: SettingsContext) {
  const {root,scope}=context;
  function element<T extends HTMLElement>(selector: string) {
    const el=root.querySelector<T>(selector);
    if(!el)throw Error(`Missing settings control: ${selector}`);
    return el;
  }
  const settings=element<HTMLDetailsElement>('#settingsManager');
  const shortcut=element<HTMLInputElement>('#shortcutsEnabled');
  shortcut.checked=context.state.shortcutsEnabled!==false;
  scope.listen(shortcut,'change',()=>{
    context.state.shortcutsEnabled=shortcut.checked;
    context.syncShortcuts();context.save();
  });
  scope.listen(element('#importantChatSettings'),'click',()=>{settings.open=false;context.openChatSettings();});
  scope.listen(element('#powerDiagnosticsBtn'),'click',()=>{settings.open=false;context.openPowerDiagnostics();});
  scope.listen(element('#settingsBackupBtn'),'click',()=>{chrome.runtime.sendMessage({type:'OPEN_SETTINGS_BACKUP'}).catch(console.error);});
  const others=['favoriteManager','followingManager','syncManager','volumeManager','channelManager'].map(id=>element<HTMLDetailsElement>('#'+id));
  scope.listen(settings,'toggle',()=>{if(settings.open)for(const panel of others)panel.open=false;});
  for(const panel of others)scope.listen(panel,'toggle',()=>{if(panel.open)settings.open=false;});
}
