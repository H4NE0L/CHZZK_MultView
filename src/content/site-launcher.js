// Only offer an entry point on normal, top-level CHZZK pages.
(() => {
  if(window.top!==window || document.getElementById('cz-site-launcher'))return;
  const host=document.createElement('div');host.id='cz-site-launcher';
  host.style.cssText='position:fixed;top:0;left:50%;transform:translateX(-50%);width:160px;height:12px;z-index:2147483646';
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=`<style>
    button{position:absolute;top:8px;left:50%;background:#00dc9b;color:#06251a;border:0;border-radius:8px;padding:10px 14px;font:bold 13px sans-serif;white-space:nowrap;cursor:pointer;opacity:0;transform:translate(-50%,calc(-100% - 8px));pointer-events:none;transition:opacity .14s ease,transform .14s ease}
    :host(:hover) button,:host(:focus-within) button{opacity:1;transform:translate(-50%,0);pointer-events:auto}
    button:focus-visible{outline:2px solid white;outline-offset:2px}
    @media(prefers-reduced-motion:reduce){button{transition:none}}
  </style><button type="button">멀티뷰 열기</button>`;
  shadow.querySelector('button').onclick=async()=>{
    const result=await chrome.runtime.sendMessage({type:'OPEN_MULTIVIEW_ON_SITE'});
    if(!result?.ok)alert('멀티뷰 열기 실패: '+(result?.error || '확장 프로그램을 다시 로드해주세요.'));
    else host.hidden=true;
  };
  document.body.appendChild(host);
})();
