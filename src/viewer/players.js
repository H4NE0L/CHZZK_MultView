globalThis.CZPlayers = {create(context) {
  const {tileMap, escapeHtml, displayChannelName, removeChannel, showNotice, applyLayout, updateChat, refreshChannelManager, saveState, applyTileLock, syncVolumeUI, clearSyncState, sendTileVolume, makeMainAudible} = context;
  function isChannelVisibleInLayout(uid) {
    const index = context.state.channels.findIndex(c => c.uid === uid);
    if (index < 0) return false;
    const displayMax = context.state.layout === "main-sub" ? 4 : 9;
    return index < displayMax;
  }

  function createTile(channel) {
    if (tileMap.has(channel.uid)) return;

    const tile = document.createElement("article");
    tile.className = "video-tile";
    tile.dataset.uid = channel.uid;

    tile.innerHTML = `
      <div class="tile-head" draggable="true">
        <span class="drag-handle" title="드래그해서 위치 변경">⠿</span>
        <span class="tile-streamer-name">${escapeHtml(displayChannelName(channel))}</span>
        <button class="main-btn" type="button" title="이 방송을 메인 방송으로 변경">메인으로 변경</button>
        <span class="tile-head-spacer"></span>
        <button class="tile-screenshot" type="button" title="스크린샷 (S)" aria-label="스크린샷 (S)"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M6 3H3v14h3M14 3h3v14h-3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
        <button class="tile-record" type="button" title="녹화 시작/종료 (R)" aria-label="녹화 시작/종료 (R)"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor"/><circle cx="10" cy="10" r="5" fill="currentColor"/></svg></button>
        <button class="tile-address" title="방송 링크 생성">링크 생성</button>
        <button class="tile-btn remove-btn" title="삭제">✕</button>
      </div>
      <div class="tile-content">
        <iframe
          src="${escapeHtml(channel.url || `https://chzzk.naver.com/live/${encodeURIComponent(channel.uid)}`)}"
          allow="autoplay; fullscreen"
          loading="eager"
          scrolling="no"
          frameborder="0"
          referrerpolicy="strict-origin-when-cross-origin">
        </iframe>
      </div>
    `;

    const removeBtn = tile.querySelector(".remove-btn");
    const header = tile.querySelector(".tile-head");


    removeBtn.addEventListener("click", e => {
      e.stopPropagation();
      removeChannel(channel.uid);
    });

    // Main broadcast changes ONLY through this button. Clicking a tile or the
    // player inside it never changes the main broadcast.
    tile.querySelector(".main-btn").addEventListener("click", e => {
      e.stopPropagation();
      if (channel.uid === context.state.selectedUid) return;
      selectChannel(channel.uid);
    });

    tile.addEventListener("mouseenter", () => {
      const iframe = tile.querySelector("iframe");
      try { CZMessages.postToPlayer(iframe, { source: "chzzk-multiview", type: "SET_NAV_VISIBLE", visible: true }); } catch (_) {}
    });
    tile.addEventListener("mouseleave", () => {
      const iframe = tile.querySelector("iframe");
      try { CZMessages.postToPlayer(iframe, { source: "chzzk-multiview", type: "SET_NAV_VISIBLE", visible: false }); } catch (_) {}
    });

    header.addEventListener("dragstart", e => {
      context.dragUid = channel.uid;
      tile.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", channel.uid);
    });

    header.addEventListener("dragend", () => {
      context.dragUid = null;
      tile.classList.remove("dragging");
      context.videoGrid.querySelectorAll(".drop-target").forEach(el => {
        el.classList.remove("drop-target");
      });
    });

    tile.querySelector('.tile-screenshot').onclick = () => context.mediaTools.screenshot(channel.uid);
    tile.querySelector('.tile-record').onclick = () => context.mediaTools.toggleRecording(channel.uid);

    const addressBtn = tile.querySelector(".tile-address");
    addressBtn.addEventListener("click", async e => {
      e.stopPropagation();
      const url = channel.url || `https://chzzk.naver.com/live/${encodeURIComponent(channel.uid)}`;
      const current = context.state.channels.find(c => c.uid === channel.uid) || channel;
      const streamerName = String(current.name || "").trim() || String(current.linkTitle || "").replace(/\s*-\s*CHZZK\s*$/i, "").trim() || String(current.title || "").replace(/\s*-\s*CHZZK\s*$/i, "").trim() || `CHZZK ${channel.uid}`;
      const linkTitle = `${streamerName} - CHZZK`;
      const html = `<a href="${escapeHtml(url)}">${escapeHtml(linkTitle)}</a>`;

      try {
        if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
          const item = new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([url], { type: "text/plain" })
          });
          await navigator.clipboard.write([item]);
        } else {
          throw new Error("Rich clipboard API unavailable");
        }

        addressBtn.textContent = "링크 복사됨";
        showNotice("방송 링크 복사됨");
        setTimeout(() => { if (addressBtn.isConnected) addressBtn.textContent = "링크 생성"; }, 900);
      } catch (_) {
        try {
          // Fallback: copy a real anchor element through the browser's rich-text clipboard path.
          const wrapper = document.createElement("div");
          wrapper.contentEditable = "true";
          wrapper.style.position = "fixed";
          wrapper.style.left = "-9999px";
          wrapper.innerHTML = html;
          document.body.appendChild(wrapper);

          const range = document.createRange();
          range.selectNodeContents(wrapper);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          document.execCommand("copy");
          selection.removeAllRanges();
          wrapper.remove();

          addressBtn.textContent = "링크 복사됨";
          showNotice("방송 링크 복사됨");
          setTimeout(() => { if (addressBtn.isConnected) addressBtn.textContent = "링크 생성"; }, 900);
        } catch (_) {}
      }
    });

    const tileFrame = tile.querySelector("iframe");
    tileFrame?.addEventListener("load", () => {
      // A freshly loaded player starts at its own default position.
      clearSyncState(channel.uid);
      try {
        CZMessages.postToPlayer(tileFrame, {
          source: "chzzk-multiview", type: "ENTER_THEATER"
        });
        CZMessages.postToPlayer(tileFrame, {
          source: "chzzk-multiview", type: "SET_CHAT_VISIBLE", visible: false
        });
      } catch (_) {}
      // New/recreated tiles start muted by default. Saved mute context.state, the
      // per-tile volume and the master volume are combined here.
      sendTileVolume(channel.uid);
    });

    tile.addEventListener("dragover", e => {
      if (!context.dragUid || context.dragUid === channel.uid) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      context.videoGrid.querySelectorAll(".drop-target").forEach(el => {
        el.classList.remove("drop-target");
      });
      tile.classList.add("drop-target");
    });

    tile.addEventListener("dragleave", () => {
      tile.classList.remove("drop-target");
    });

    tile.addEventListener("drop", e => {
      e.preventDefault();
      tile.classList.remove("drop-target");

      const fromUid = e.dataTransfer.getData("text/plain") || context.dragUid;
      const toUid = channel.uid;

      if (!fromUid || fromUid === toUid) return;
      swapChannels(fromUid, toUid);
    });

    tileMap.set(channel.uid, tile);
    context.mediaTools.attachTile(channel.uid,tile);
    context.videoGrid.appendChild(tile);

    updateTileMainUI(channel.uid);
    sendTileVolume(channel.uid);
    applyTileLock(tile, context.state.screenLocked === true);

    // Do not touch iframe.src after creation.
    // This is the key to preserving the live player while changing layout/order.
  }

  // Used when switching to the raid view: the current main broadcast moves to
  // the front without touching the iframes.
  function moveSelectedToFront() {
    const index = context.state.channels.findIndex(c => c.uid === context.state.selectedUid);
    if (index > 0) {
      context.state.channels = [context.state.channels[index], ...context.state.channels.slice(0, index), ...context.state.channels.slice(index + 1)];
    }
  }

  function swapChannels(fromUid, toUid) {
    const fromIndex = context.state.channels.findIndex(c => c.uid === fromUid);
    const toIndex = context.state.channels.findIndex(c => c.uid === toUid);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    [context.state.channels[fromIndex], context.state.channels[toIndex]] =
      [context.state.channels[toIndex], context.state.channels[fromIndex]];

    // Do not move or recreate iframe DOM nodes. CSS grid positioning is updated
    // from the saved channel order instead.
    applyLayout();
    syncSelection();
    saveState();
  }

  function selectChannel(uid) {
    if (!context.state.channels.some(c => c.uid === uid)) return;

    context.state.selectedUid = uid;

    // In raid view, the selected/main broadcast is always the large tile.
    // Reorder the saved channel list so the large slot follows the selected
    // broadcast without recreating the existing iframe elements.
    if (context.state.layout === "main-sub") moveSelectedToFront();

    if (context.state.mainOnly) makeMainAudible();

    syncSelection();
    applyLayout();
    updateChat();
    refreshChannelManager();
    saveState();
  }

  // Highlight + "메인으로 변경 / 현재 메인" context.state of one tile.
  function updateTileMainUI(uid) {
    const tile = tileMap.get(uid);
    if (!tile) return;
    const selected = uid === context.state.selectedUid;
    tile.classList.toggle("selected", selected);
    tile.classList.toggle("tile-hover-controls", selected);
    const mainBtn = tile.querySelector(".main-btn");
    if (mainBtn) {
      mainBtn.textContent = selected ? "현재 메인" : "메인으로 변경";
      mainBtn.disabled = selected;
      mainBtn.classList.toggle("is-main", selected);
    }
  }

  function syncSelection() {
    for (const channel of context.state.channels) {
      const tile = tileMap.get(channel.uid);
      if (!tile) continue;

      updateTileMainUI(channel.uid);
      sendTileVolume(channel.uid);
      const iframe = tile.querySelector("iframe");
      try {
        CZMessages.postToPlayer(iframe, {
          source: "chzzk-multiview",
          type: "SET_NAV_VISIBLE",
          visible: false
        });
        CZMessages.postToPlayer(iframe, {
          source: "chzzk-multiview",
          type: "SET_CHAT_VISIBLE",
          visible: false
        });
      } catch (_) {}
    }
    syncVolumeUI();
  }

  return {isChannelVisibleInLayout, createTile, moveSelectedToFront, swapChannels, selectChannel, updateTileMainUI, syncSelection};
}};
