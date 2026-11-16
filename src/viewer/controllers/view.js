import {lockPageScroll} from './site-scroll.js';
import {html} from '../template';
export function mount({rootId:ROOT_ID,siteMode,scope}) {
    if (document.getElementById(ROOT_ID)) {
      const existing = document.getElementById(ROOT_ID);
      existing.style.display = "block";

      return null;
    }

    const host = document.createElement("div");
    host.id = ROOT_ID;
    document.body.appendChild(host);
    if(siteMode){
      scope.add(lockPageScroll(document));
      host.style.cssText='position:fixed!important;inset:0!important;width:100%!important;height:100%!important;overflow:hidden!important;box-sizing:border-box!important;z-index:2147483647!important';
      document.querySelectorAll('video').forEach(video=>{video.muted=true;video.pause();});
    }
    const shadowRoot = host.attachShadow({ mode: "open" });

    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = chrome.runtime.getURL("src/viewer/viewer.css");
    shadowRoot.appendChild(style);
    const groupStyle = document.createElement('link');
    groupStyle.rel = 'stylesheet'; groupStyle.href = chrome.runtime.getURL('src/shared/group-manager.css');
    shadowRoot.appendChild(groupStyle);

    const ui = document.createElement("div");
    ui.className = "mv-root";
    ui.innerHTML = html;

    shadowRoot.appendChild(ui);
    if(siteMode){
      const exit=document.createElement('button');exit.textContent='치지직으로 돌아가기';exit.id='siteReturnBtn';exit.className='center-btn';exit.type='button';exit.onclick=()=>location.reload();ui.querySelector('#centerControls').appendChild(exit);ui.querySelector('#centerControls').classList.add('has-site-return');
    }

  return {ui,videoGrid:ui.querySelector('#videoGrid'),chatPanel:ui.querySelector('#chatPanel')};
}
