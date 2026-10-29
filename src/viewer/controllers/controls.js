export function bind(context) {
  const {ui,addFromInput,clearAll,favoriteController,toggleToolbar,toggleChat,toggleChatSide,toggleScreenLock,scope,saveState,syncShortcutSettings,
    importantChat,powerDiagnostics,volumePanel,renderSyncUI,resetAllSync,adjustSync,resetSync,moveSelectedToFront,applyLayout,
    updateLayoutToggle,refreshFavoriteList,refreshChannelManager,setChatOpen,setChatSide,setScreenLock,updateToolbarToggleUI,syncVolumeUI}=context;
    ui.querySelector("#addBtn").addEventListener("click", addFromInput);
    ui.querySelector("#clearBtn").addEventListener("click", clearAll);
    favoriteController.bind();

    ui.querySelector("#collapseBtn").addEventListener("click", toggleToolbar);
    ui.querySelector("#chatToggleBtn").addEventListener("click", toggleChat);
    ui.querySelector("#chatSideBtn").addEventListener("click", toggleChatSide);
    ui.querySelector("#screenLockBtn").addEventListener("click", toggleScreenLock);
    CZViewerSettings.bind({root:ui,get state(){return context.state;},scope,save:saveState,syncShortcuts:syncShortcutSettings,
      openChatSettings:()=>importantChat.openSettings(),openPowerDiagnostics:()=>powerDiagnostics.open()});
    volumePanel.bind();

    // Only one of the sync / volume panels is open at a time (both are right-aligned).
    ui.querySelector("#syncManager").addEventListener("toggle", e => {
      if (!e.target.open) return;
      ui.querySelector("#volumeManager")?.removeAttribute("open");
      renderSyncUI();
    });
    ui.querySelector("#volumeManager").addEventListener("toggle", e => {
      if (e.target.open) ui.querySelector("#syncManager")?.removeAttribute("open");
    });
    ui.querySelector("#syncResetAll").addEventListener("click", resetAllSync);
    ui.querySelector("#syncList").addEventListener("click", e => {
      const btn = e.target.closest("button");
      const uid = btn?.closest(".sync-row")?.dataset.uid;
      if (!btn || !uid || btn.disabled) return;
      if (btn.dataset.step) adjustSync(uid, Number(btn.dataset.step));
      else if (btn.dataset.reset !== undefined) resetSync(uid);
    });

    ui.querySelector("#uidInput").addEventListener("keydown", e => {
      if (e.key === "Enter") addFromInput();
    });

    ui.querySelectorAll(".layout-toggle-btn").forEach(button => {
      button.addEventListener("click", () => {
        const state=context.state;
        const nextLayout = button.dataset.layout;
        if (!["grid", "main-sub"].includes(nextLayout)) return;
        if (state.layout === nextLayout) return;
        state.layout = nextLayout;
        // The raid view always shows the current main broadcast in the big slot.
        if (nextLayout === "main-sub") moveSelectedToFront();
        applyLayout();
        saveState();
      });
    });

    const state=context.state;
    if (state.layout === "2x2" || state.layout === "3x3") state.layout = "grid";
    if (state.layout !== "grid" && state.layout !== "main-sub") state.layout = "grid";
    updateLayoutToggle();
    refreshFavoriteList();
    refreshChannelManager();
    setChatOpen(state.chatOpen !== false);
    setChatSide(state.chatSide, false);
    setScreenLock(state.screenLocked === true, false);
    updateToolbarToggleUI();
    syncVolumeUI();
    renderSyncUI();

}
