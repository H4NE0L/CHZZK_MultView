import type {ViewerSession} from '../shared/contracts/session';
import type {ResourceScope} from '../shared/runtime/scope';
interface SettingsContext {
  root: HTMLElement;
  readonly state: ViewerSession;
  scope: ResourceScope;
  save(): void;
  syncShortcuts(): void;
  setChatOpen(value: boolean): void;
  setChatSide(value: string): void;
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
  root.dataset.rewindBar=String(context.state.rewindBar!==false);
  // New settings join a category through these data attributes.
  const tabs=[...root.querySelectorAll<HTMLButtonElement>('[data-settings-tab]')];
  function selectCategory(name: string){for(const tab of tabs){const selected=tab.dataset.settingsTab===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}for(const panel of root.querySelectorAll<HTMLElement>('[data-settings-panel]'))panel.hidden=panel.dataset.settingsPanel!==name;}
  tabs.forEach((tab,index)=>{scope.listen(tab,'click',()=>selectCategory(tab.dataset.settingsTab!));scope.listen(tab,'keydown',event=>{const e=event as KeyboardEvent;if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectCategory(tabs[next]!.dataset.settingsTab!);tabs[next]!.focus();});});
  scope.listen(element('#openChatSettingsBtn'),'click',()=>{settings.open=false;context.openChatSettings();});
  scope.listen(element('#settingsLayoutBtn'),'click',()=>{const next=context.state.layout==='grid'?'main-sub':'grid';root.querySelector<HTMLButtonElement>(`.layout-toggle-btn[data-layout="${next}"]`)?.click();});
  scope.listen(element('#settingsScreenLockBtn'),'click',()=>element<HTMLButtonElement>('#screenLockBtn').click());
  for(const [selector,key] of [['#rewindBarEnabled','rewindBar'],['#autoWideEnabled','autoWide']] as const){const input=element<HTMLInputElement>(selector);input.checked=context.state[key]!==false;scope.listen(input,'change',()=>{context.state[key]=input.checked;if(key==='rewindBar')root.dataset.rewindBar=String(input.checked);else context.syncShortcuts();context.save();});}
  const chatOpen=element<HTMLInputElement>('#settingsChatOpenEnabled'),chatSide=element<HTMLSelectElement>('#settingsChatSide');
  const syncChat=()=>{chatOpen.checked=context.state.chatOpen!==false;chatSide.value=context.state.chatSide;};syncChat();
  scope.listen(settings,'toggle',syncChat);
  scope.listen(chatOpen,'change',()=>context.setChatOpen(chatOpen.checked));scope.listen(chatSide,'change',()=>context.setChatSide(chatSide.value));
  const shortcut=element<HTMLInputElement>('#shortcutsEnabled');
  shortcut.checked=context.state.shortcutsEnabled!==false;
  scope.listen(shortcut,'change',()=>{
    context.state.shortcutsEnabled=shortcut.checked;
    context.syncShortcuts();context.save();
  });
  scope.listen(element('#powerDiagnosticsBtn'),'click',()=>{settings.open=false;context.openPowerDiagnostics();});
  scope.listen(element('#settingsBackupBtn'),'click',()=>{chrome.runtime.sendMessage({type:'OPEN_SETTINGS_BACKUP'}).catch(console.error);});
  const power=element<HTMLInputElement>('#powerRewardsEnabled');
  power.checked=context.state.powerRewards===true;
  scope.listen(power,'change',()=>{context.state.powerRewards=power.checked;context.syncShortcuts();context.save();});
  const timestamps=element<HTMLInputElement>('#chatTimestampsEnabled');
  timestamps.checked=context.state.chatTimestamps===true;
  root.dataset.chatTimestamps=String(timestamps.checked);
  scope.listen(timestamps,'change',()=>{context.state.chatTimestamps=timestamps.checked;context.syncShortcuts();context.save();});
  const others=['favoriteManager','followingManager','syncManager','volumeManager','channelManager'].map(id=>element<HTMLDetailsElement>('#'+id));
  scope.listen(settings,'toggle',()=>{if(settings.open)for(const panel of others)panel.open=false;});
  for(const panel of others)scope.listen(panel,'toggle',()=>{if(panel.open)settings.open=false;});
}
