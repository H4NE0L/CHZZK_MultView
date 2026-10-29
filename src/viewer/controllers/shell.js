export function create(context) {
  const {scope,tileMap,saveState,applyLayout,updateChat,resizeFixedAspectGrid}=context;
  let toolbarCollapsed=false;
  const ICON_CHEVRON_UP = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  const ICON_CHEVRON_DOWN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  function chatSideIcon(side) {
    const x = side === "left" ? 3 : 15;
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="${x}" y="4" width="6" height="16" rx="1" fill="currentColor" stroke="none"/></svg>`;
  }


  function applyTileLock(tile, locked) {
    if (!tile) return;
    let shield = tile.querySelector(".tile-lock-shield");
    if (locked && !shield) {
      shield = document.createElement("div");
      shield.className = "tile-lock-shield";
      shield.title = "화면 잠금 상태";
      tile.querySelector(".tile-content")?.appendChild(shield);
    }
    if (shield) shield.style.display = locked ? "block" : "none";
    tile.classList.toggle("screen-locked", locked);
  }

  function setScreenLock(locked, persist = true) {
    const {state,ui}=context;
    state.screenLocked = !!locked;
    if (ui) {
      const buttons = [ui.querySelector("#screenLockBtn")].filter(Boolean);
      for (const btn of buttons) {
        btn.textContent = state.screenLocked ? "화면 잠금 해제" : "화면 잠금";
        btn.title = state.screenLocked ? "플레이어 조작 잠금 해제" : "플레이어 조작 잠금";
        btn.classList.toggle("lock-active", state.screenLocked);
      }
    }
    for (const tile of tileMap.values()) applyTileLock(tile, state.screenLocked);
    if (persist) saveState();
  }

  function toggleScreenLock() {
    const state=context.state;
    setScreenLock(!state.screenLocked);
  }

  function toggleToolbar() {
    const ui=context.ui;
    if (!ui) return;
    toolbarCollapsed = !toolbarCollapsed;
    ui.classList.toggle("toolbar-collapsed", toolbarCollapsed);
    updateToolbarToggleUI();
    resizeFixedAspectGrid();
  }

  function updateToolbarToggleUI() {
    const ui=context.ui;
    if (!ui) return;
    const btn = ui.querySelector("#collapseBtn");
    if (!btn) return;
    btn.innerHTML = toolbarCollapsed ? ICON_CHEVRON_DOWN : ICON_CHEVRON_UP;
    btn.title = toolbarCollapsed ? "멀티뷰 메뉴 펼치기" : "멀티뷰 메뉴 접기";
    btn.setAttribute("aria-label", btn.title);
  }

  function setChatSide(side, persist = true) {
    const {state,ui}=context;
    state.chatSide = side === "left" ? "left" : "right";
    if (!ui) return;
    ui.classList.toggle("chat-left", state.chatSide === "left");
    const btn = ui.querySelector("#chatSideBtn");
    if (btn) {
      btn.innerHTML = chatSideIcon(state.chatSide);
      btn.title = state.chatSide === "left" ? "채팅창을 오른쪽으로 이동" : "채팅창을 왼쪽으로 이동";
      btn.setAttribute("aria-label", btn.title);
    }
    // Chat side changes both the outer panel position and the 1+3 / 3+1
    // raid arrangement. Re-apply the layout so gridColumn/gridRow follow it.
    applyLayout();
    if (persist) saveState();
  }

  function toggleChatSide() {
    const state=context.state;
    setChatSide(state.chatSide === "left" ? "right" : "left");
  }

  function setChatOpen(open) {
    const {state,ui}=context;
    if (!ui) return;
    state.chatOpen = !!open;
    ui.classList.toggle("chat-closed", !state.chatOpen);
    const btn = ui.querySelector("#chatToggleBtn");
    if (btn) btn.textContent = state.chatOpen ? "채팅 닫기" : "채팅 열기";
    updateChat();
    resizeFixedAspectGrid();
    saveState();
  }

  function toggleChat() {
    const state=context.state;
    setChatOpen(state.chatOpen === false);
  }

  function showNotice(message) {
    const ui=context.ui;
    if (!ui) return;
    let notice = ui.querySelector(".mv-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "mv-notice";
      ui.appendChild(notice);
    }
    notice.textContent = message;
    notice.classList.remove("show");
    void notice.offsetWidth;
    notice.classList.add("show");
    notice._hideTimer?.();
    notice._hideTimer = scope.timeout(() => notice.classList.remove("show"), 1400);
  }

  return {get collapsed(){return toolbarCollapsed;},applyTileLock,setScreenLock,toggleScreenLock,toggleToolbar,updateToolbarToggleUI,
    setChatSide,toggleChatSide,setChatOpen,toggleChat,showNotice};
}
