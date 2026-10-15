// Only offer an entry point on normal, top-level CHZZK pages.
(() => {
  if(window.top!==window || document.getElementById('cz-site-launcher'))return;
  const host=document.createElement('div');host.id='cz-site-launcher';
  host.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483646';
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML='<style>button{background:#00dc9b;color:#06251a;border:0;border-radius:8px;padding:10px 14px;font:bold 13px sans-serif;cursor:pointer}</style><button type="button">통합관제실 열기</button>';
  shadow.querySelector('button').onclick=async()=>{
    const result=await chrome.runtime.sendMessage({type:'OPEN_MULTIVIEW_ON_SITE'});
    if(!result?.ok)alert('멀티뷰 열기 실패: '+(result?.error || '확장 프로그램을 다시 로드해주세요.'));
    else host.hidden=true;
  };
  document.body.appendChild(host);
})();
