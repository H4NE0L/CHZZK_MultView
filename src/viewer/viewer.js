"use strict";
(() => {
  // src/viewer/audio.js
  var audio = { create(context) {
    const { tileMap, syncVolumeUI, saveStateSoon, saveState } = context;
    function clamp01(value) {
      const n = Number(value);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    }
    function mainUid() {
      if (context.state.selectedUid && context.state.channels.some((c) => c.uid === context.state.selectedUid)) return context.state.selectedUid;
      return context.state.channels[0]?.uid || null;
    }
    function effectiveVolume(channel) {
      return clamp01(channel.volume ?? 1) * clamp01(context.state.masterVolume ?? 1);
    }
    function isForcedMuted(channel) {
      return clamp01(context.state.masterVolume ?? 1) <= 0 || context.state.mainOnly === true && channel.uid !== mainUid();
    }
    function effectiveMuted(channel) {
      return channel.muted === true || clamp01(channel.volume ?? 1) <= 0 || isForcedMuted(channel);
    }
    function sendTileVolume(uid) {
      const channel = context.state.channels.find((c) => c.uid === uid);
      const iframe = tileMap.get(uid)?.querySelector("iframe");
      if (!channel || !iframe) return;
      try {
        CZMessages.postToPlayer(iframe, {
          source: "chzzk-multiview",
          type: "SET_VOLUME",
          volume: effectiveVolume(channel),
          muted: effectiveMuted(channel)
        });
      } catch (_) {
      }
    }
    function sendAllTileVolumes() {
      for (const uid of tileMap.keys()) sendTileVolume(uid);
    }
    function reconcile() {
      sendAllTileVolumes();
      if (context.state.channels.some((channel) => tileMap.has(channel.uid) && !effectiveMuted(channel))) context.ensureAudible?.();
    }
    function setTileVolume(uid, volume) {
      const channel = context.state.channels.find((c) => c.uid === uid);
      if (!channel) return;
      channel.volume = clamp01(volume);
      channel.muted = channel.volume <= 0;
      if (!effectiveMuted(channel)) context.ensureAudible?.();
      sendTileVolume(uid);
      syncVolumeUI();
      saveStateSoon();
    }
    function toggleTileMute(uid) {
      const channel = context.state.channels.find((c) => c.uid === uid);
      if (!channel) return;
      const silent = channel.muted === true || clamp01(channel.volume ?? 1) <= 0;
      if (silent) {
        channel.muted = false;
        if (clamp01(channel.volume ?? 1) <= 0) channel.volume = 0.5;
      } else {
        channel.muted = true;
      }
      if (!effectiveMuted(channel)) context.ensureAudible?.();
      sendTileVolume(uid);
      syncVolumeUI();
      saveStateSoon();
    }
    function setMasterVolume(value) {
      context.state.masterVolume = clamp01(value);
      if (context.state.channels.some((channel) => !effectiveMuted(channel))) context.ensureAudible?.();
      sendAllTileVolumes();
      syncVolumeUI();
      saveStateSoon();
    }
    function toggleMasterMute() {
      const current = clamp01(context.state.masterVolume ?? 1);
      if (current <= 0) {
        context.state.masterVolume = clamp01(context.state._previousMasterVolume ?? 1);
        if (context.state.masterVolume <= 0) context.state.masterVolume = 1;
      } else {
        context.state._previousMasterVolume = current;
        context.state.masterVolume = 0;
      }
      if (context.state.channels.some((channel) => !effectiveMuted(channel))) context.ensureAudible?.();
      sendAllTileVolumes();
      syncVolumeUI();
      saveStateSoon();
    }
    function makeMainAudible() {
      const main = context.state.channels.find((c) => c.uid === mainUid());
      if (!main) return;
      main.muted = false;
      if (clamp01(main.volume ?? 1) <= 0) main.volume = 0.5;
      if (!effectiveMuted(main)) context.ensureAudible?.();
    }
    function setMainOnly(on) {
      context.state.mainOnly = !!on;
      if (context.state.mainOnly) makeMainAudible();
      if (context.state.channels.some((channel) => !effectiveMuted(channel))) context.ensureAudible?.();
      sendAllTileVolumes();
      syncVolumeUI();
      saveState();
    }
    function receiveVideoState(message) {
      const channel = context.state.channels.find((c) => c.uid === message.uid);
      if (!channel || message.reason !== "player") return;
      if (isForcedMuted(channel)) {
        sendTileVolume(channel.uid);
        return;
      }
      const master = clamp01(context.state.masterVolume ?? 1);
      if (master > 0 && typeof message.volume === "number" && Number.isFinite(message.volume) && (message.operation !== "mute" || !message.muted && channel.volume <= 0)) channel.volume = clamp01(message.volume / master);
      if (typeof message.muted === "boolean") channel.muted = message.muted || channel.volume <= 0;
      if (Math.abs(message.volume - effectiveVolume(channel)) > 1e-5 || message.muted !== effectiveMuted(channel)) sendTileVolume(channel.uid);
      if (!effectiveMuted(channel)) context.ensureAudible?.();
      syncVolumeUI();
      saveStateSoon();
    }
    return { reconcile, clamp01, mainUid, effectiveVolume, isForcedMuted, effectiveMuted, sendTileVolume, sendAllTileVolumes, setTileVolume, toggleTileMute, setMasterVolume, toggleMasterMute, makeMainAudible, setMainOnly, receiveVideoState };
  } };

  // src/viewer/chat.js
  var chat = { create(context) {
    function releaseChat() {
      const frame = context.chatFrame;
      context.chatFrame = null;
      if (frame) {
        frame.onload = null;
        frame.dataset.playerReady = "false";
        frame.src = "about:blank";
        frame.remove();
      }
      context.chatPanel.querySelector(".chat-frame-wrap").replaceChildren();
      context.onUpdated?.();
    }
    function updateChat() {
      const uid = context.state.selectedUid;
      const selected = context.state.channels.find((c) => c.uid === uid);
      if (context.state.chatOpen === false || !selected) {
        releaseChat();
        if (context.state.chatOpen === false) return;
        context.chatPanel.querySelector(".chat-frame-wrap").innerHTML = `
        <div id="chatEmpty" class="chat-empty">
          메인 방송을 선택하면<br>실제 CHZZK 채팅을 불러옵니다.
        </div>`;
        context.chatFrame = null;
        return;
      }
      const wrap = context.chatPanel.querySelector(".chat-frame-wrap");
      if (!context.chatFrame) {
        context.chatFrame = document.createElement("iframe");
        context.chatFrame.className = "chat-frame";
        context.chatFrame.allow = "autoplay";
        context.chatFrame.referrerPolicy = "strict-origin-when-cross-origin";
        wrap.innerHTML = "";
        wrap.appendChild(context.chatFrame);
        const frame = context.chatFrame;
        frame.onload = () => {
          if (context.chatFrame !== frame || !frame.isConnected || context.state.chatOpen === false) return;
          try {
            CZMessages.postToPlayer(frame, {
              source: "chzzk-multiview",
              type: "SET_CHAT_MODE",
              visible: true
            });
          } catch (_) {
          }
        };
      }
      const channel = context.state.channels.find((c) => c.uid === uid);
      const target = channel?.type === "video" ? `${channel.url}${channel.url.includes("?") ? "&" : "?"}multiview=chat` : `https://chzzk.naver.com/live/${encodeURIComponent(channel?.sourceId || uid)}/chat?multiview=1`;
      if (context.chatFrame.dataset.uid !== uid) {
        context.chatFrame.dataset.uid = uid;
        context.chatFrame.dataset.playerReady = "false";
        context.chatFrame.src = target;
      }
      context.onUpdated?.();
    }
    return { updateChat };
  } };

  // src/viewer/players.js
  var players = { create(context) {
    const { tileMap, escapeHtml, displayChannelName, removeChannel, showNotice, applyLayout, updateChat, refreshChannelManager, saveState, applyTileLock, syncVolumeUI, clearSyncState, sendTileVolume, makeMainAudible } = context;
    function isChannelVisibleInLayout(uid) {
      const index = context.state.channels.findIndex((c) => c.uid === uid);
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
        <button class="tile-screenshot" type="button" title="스크린샷 (S)" aria-label="스크린샷 (S)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 3v14a1 1 0 0 0 1 1h14M3 6h14a1 1 0 0 1 1 1v14" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="tile-record" type="button" title="녹화 시작/종료 (R)" aria-label="녹화 시작/종료 (R)"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor"/><circle cx="10" cy="10" r="5" fill="currentColor"/></svg></button>
        <button class="tile-address" title="방송 주소 복사">주소 복사</button>
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
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeChannel(channel.uid);
      });
      tile.querySelector(".main-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        if (channel.uid === context.state.selectedUid) return;
        selectChannel(channel.uid);
      });
      tile.addEventListener("mouseenter", () => {
        tile.classList.add("tile-pointer-over");
        const iframe = tile.querySelector("iframe");
        try {
          CZMessages.postToPlayer(iframe, { source: "chzzk-multiview", type: "SET_NAV_VISIBLE", visible: true });
        } catch (_) {
        }
      });
      tile.addEventListener("mouseleave", () => {
        tile.classList.remove("tile-pointer-over");
        const iframe = tile.querySelector("iframe");
        try {
          CZMessages.postToPlayer(iframe, { source: "chzzk-multiview", type: "SET_NAV_VISIBLE", visible: false });
        } catch (_) {
        }
      });
      header.addEventListener("dragstart", (e) => {
        context.dragUid = channel.uid;
        tile.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", channel.uid);
      });
      header.addEventListener("dragend", () => {
        context.dragUid = null;
        tile.classList.remove("dragging");
        context.videoGrid.querySelectorAll(".drop-target").forEach((el) => {
          el.classList.remove("drop-target");
        });
      });
      tile.querySelector(".tile-screenshot").onclick = () => context.mediaTools.screenshot(channel.uid);
      tile.querySelector(".tile-record").onclick = () => context.mediaTools.toggleRecording(channel.uid);
      const addressBtn = tile.querySelector(".tile-address");
      addressBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const url = channel.url || `https://chzzk.naver.com/live/${encodeURIComponent(channel.uid)}`;
        try {
          try {
            await navigator.clipboard.writeText(url);
          } catch (_) {
            const input = document.createElement("textarea");
            input.value = url;
            input.style.cssText = "position:fixed;left:-9999px;top:0";
            const previousFocus = document.activeElement;
            document.body.appendChild(input);
            try {
              input.select();
              if (!document.execCommand("copy")) throw new Error("주소 복사 실패");
            } finally {
              input.remove();
              previousFocus?.focus({ preventScroll: true });
            }
          }
          addressBtn.textContent = "주소 복사됨";
          showNotice("방송 주소 복사됨");
          setTimeout(() => {
            if (addressBtn.isConnected) addressBtn.textContent = "주소 복사";
          }, 900);
        } catch (_) {
          showNotice("방송 주소를 복사하지 못했습니다.");
        }
      });
      const tileFrame = tile.querySelector("iframe");
      tileFrame?.addEventListener("load", () => {
        clearSyncState(channel.uid);
        try {
          CZMessages.postToPlayer(tileFrame, {
            source: "chzzk-multiview",
            type: "ENTER_THEATER"
          });
          CZMessages.postToPlayer(tileFrame, {
            source: "chzzk-multiview",
            type: "SET_CHAT_VISIBLE",
            visible: false
          });
        } catch (_) {
        }
        sendTileVolume(channel.uid);
      });
      tile.addEventListener("dragover", (e) => {
        if (!context.dragUid || context.dragUid === channel.uid) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        context.videoGrid.querySelectorAll(".drop-target").forEach((el) => {
          el.classList.remove("drop-target");
        });
        tile.classList.add("drop-target");
      });
      tile.addEventListener("dragleave", () => {
        tile.classList.remove("drop-target");
      });
      tile.addEventListener("drop", (e) => {
        e.preventDefault();
        tile.classList.remove("drop-target");
        const fromUid = e.dataTransfer.getData("text/plain") || context.dragUid;
        const toUid = channel.uid;
        if (!fromUid || fromUid === toUid) return;
        swapChannels(fromUid, toUid);
      });
      tileMap.set(channel.uid, tile);
      context.mediaTools.attachTile(channel.uid, tile);
      context.videoGrid.appendChild(tile);
      updateTileMainUI(channel.uid);
      sendTileVolume(channel.uid);
      applyTileLock(tile, context.state.screenLocked === true);
    }
    function moveSelectedToFront() {
      const index = context.state.channels.findIndex((c) => c.uid === context.state.selectedUid);
      if (index > 0) {
        context.state.channels = [context.state.channels[index], ...context.state.channels.slice(0, index), ...context.state.channels.slice(index + 1)];
      }
    }
    function swapChannels(fromUid, toUid) {
      const fromIndex = context.state.channels.findIndex((c) => c.uid === fromUid);
      const toIndex = context.state.channels.findIndex((c) => c.uid === toUid);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      const proposed = context.state.channels.slice();
      [proposed[fromIndex], proposed[toIndex]] = [proposed[toIndex], proposed[fromIndex]];
      if (!context.mediaTools.canDisplay(proposed, context.state.layout)) return;
      [context.state.channels[fromIndex], context.state.channels[toIndex]] = [context.state.channels[toIndex], context.state.channels[fromIndex]];
      applyLayout();
      syncSelection();
      saveState();
    }
    function selectChannel(uid) {
      if (!context.state.channels.some((c) => c.uid === uid)) return;
      const proposed = context.state.layout === "main-sub" ? [...context.state.channels.filter((channel) => channel.uid === uid), ...context.state.channels.filter((channel) => channel.uid !== uid)] : context.state.channels;
      if (!context.mediaTools.canDisplay(proposed, context.state.layout)) return;
      context.state.selectedUid = uid;
      if (context.state.layout === "main-sub") moveSelectedToFront();
      if (context.state.mainOnly) makeMainAudible();
      syncSelection();
      applyLayout();
      updateChat();
      refreshChannelManager();
      saveState();
    }
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
    function syncSelection({ audio: audio2 = true, chrome: chrome2 = true } = {}) {
      for (const channel of context.state.channels) {
        const tile = tileMap.get(channel.uid);
        if (!tile) continue;
        updateTileMainUI(channel.uid);
        if (audio2) sendTileVolume(channel.uid);
        if (!chrome2) continue;
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
        } catch (_) {
        }
      }
      syncVolumeUI();
    }
    return { isChannelVisibleInLayout, createTile, moveSelectedToFront, swapChannels, selectChannel, updateTileMainUI, syncSelection };
  } };

  // src/viewer/sync.js
  var sync = { create(context) {
    const { tileMap, showNotice, escapeHtml, displayChannelName } = context;
    const syncOffsets = /* @__PURE__ */ new Map();
    const syncDelays = /* @__PURE__ */ new Map();
    const syncPending = /* @__PURE__ */ new Map();
    const SYNC_STATE_STALE_MS = 5e3;
    let syncRequestSeq = 0;
    let syncSig = "";
    let syncFrame = 0;
    function formatSyncSeconds(ms) {
      if (!ms) return "0초";
      const seconds = Number((Math.abs(ms) / 1e3).toFixed(2));
      return `${ms < 0 ? "-" : "+"}${seconds}초`;
    }
    function syncState(channel) {
      if (channel.type === "video") return { supported: false, note: "다시보기는 싱크 조정을 지원하지 않습니다." };
      if (!tileMap.has(channel.uid)) return { supported: false, note: "화면에 표시 중인 방송이 아닙니다." };
      return { supported: true, note: "" };
    }
    function requestSync(uid, deltaSeconds, reset = false, latest = false) {
      const iframe = tileMap.get(uid)?.querySelector("iframe");
      if (!iframe?.contentWindow) return;
      const requestId = ++syncRequestSeq;
      syncPending.set(requestId, { uid, reset, latest });
      setTimeout(() => {
        if (syncPending.delete(requestId)) showNotice("싱크 조정 응답이 없습니다. 방송이 아직 로딩 중일 수 있습니다.");
      }, 2500);
      try {
        CZMessages.postToPlayer(iframe, {
          source: "chzzk-multiview",
          type: "SYNC_SEEK",
          requestId,
          delta: deltaSeconds,
          latest
        });
      } catch (_) {
        syncPending.delete(requestId);
      }
    }
    function externalSeek(uid, applied) {
      if (!Number.isFinite(applied)) return;
      syncOffsets.set(uid, (syncOffsets.get(uid) || 0) + applied * 1e3);
      scheduleSyncRender();
    }
    function adjustSync(uid, deltaSeconds) {
      if (deltaSeconds === "latest") {
        const channel = context.state.channels.find((c) => c.uid === uid);
        if (channel && syncState(channel).supported) requestSync(uid, 0, false, true);
        return;
      }
      if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return;
      requestSync(uid, deltaSeconds, false);
    }
    function resetSync(uid) {
      const offset = syncOffsets.get(uid) || 0;
      if (!offset) return;
      requestSync(uid, -offset / 1e3, true);
    }
    function resetAllSync() {
      for (const [uid, offset] of [...syncOffsets]) {
        if (offset) resetSync(uid);
      }
    }
    function clearSyncState(uid) {
      syncOffsets.delete(uid);
      syncDelays.delete(uid);
      for (const [id, pending] of syncPending) if (pending.uid === uid) syncPending.delete(id);
      scheduleSyncRender();
    }
    function handleSyncResult(data) {
      const pending = syncPending.get(data.requestId);
      if (!pending || pending.uid !== data.uid) return;
      syncPending.delete(data.requestId);
      if (data.ok !== true) {
        showNotice(data.reason === "not-seekable" ? "이 방송은 아직 싱크를 조정할 수 없습니다. 재생이 시작된 뒤 다시 시도하세요." : "싱크를 조정하지 못했습니다.");
        return;
      }
      const applied = Math.round((Number(data.applied) || 0) * 1e3);
      let next = (syncOffsets.get(data.uid) || 0) + applied;
      if (Math.abs(next) < 10) next = 0;
      if (next === 0) syncOffsets.delete(data.uid);
      else syncOffsets.set(data.uid, next);
      if (typeof data.delay === "number" && Number.isFinite(data.delay)) {
        syncDelays.set(data.uid, { delay: data.delay, canSeek: true, t: Date.now() });
      }
      if (data.clamped && !pending.latest) {
        const forward = Number(data.requested) > 0;
        showNotice(applied === 0 ? forward ? "더 이상 앞으로 당길 수 없습니다. (라이브에 가장 가깝습니다)" : "더 이상 뒤로 돌릴 수 없습니다." : "한계에 도달하여 일부만 적용되었습니다.");
      }
      scheduleSyncRender();
    }
    function handleSyncState(data) {
      const num = typeof data.delay === "number" && Number.isFinite(data.delay) ? data.delay : null;
      syncDelays.set(data.uid, { delay: num, canSeek: data.canSeek === true, t: Date.now() });
      if (context.ui?.querySelector("#syncManager")?.open) scheduleSyncRender();
    }
    function scheduleSyncRender() {
      if (syncFrame || !context.ui) return;
      syncFrame = requestAnimationFrame(() => {
        syncFrame = 0;
        renderSyncUI();
      });
    }
    function renderSyncUI() {
      if (!context.ui) return;
      const adjusted = context.state.channels.filter((c) => syncOffsets.get(c.uid));
      const badge = context.ui.querySelector("#syncBadge");
      if (badge) {
        badge.hidden = adjusted.length === 0;
        badge.textContent = String(adjusted.length);
        badge.title = `싱크 조정된 방송 ${adjusted.length}개`;
      }
      const resetAll = context.ui.querySelector("#syncResetAll");
      if (resetAll) resetAll.disabled = adjusted.length === 0;
      const summary = context.ui.querySelector("#syncSummaryList");
      if (summary) {
        summary.innerHTML = adjusted.length ? adjusted.map((c) => `<span class="sync-chip"><b>${escapeHtml(displayChannelName(c))}</b>${formatSyncSeconds(syncOffsets.get(c.uid))}</span>`).join("") : '<span class="sync-summary-empty">싱크를 조정한 방송이 없습니다.</span>';
      }
      const panel = context.ui.querySelector("#syncManager");
      const list = context.ui.querySelector("#syncList");
      if (!panel?.open || !list) return;
      const sig = context.state.channels.map((c) => `${c.uid}\0${displayChannelName(c)}\0${c.uid === context.state.selectedUid ? 1 : 0}\0${syncState(c).supported ? 1 : 0}`).join("\n");
      if (sig !== syncSig) {
        syncSig = sig;
        list.innerHTML = context.state.channels.length ? context.state.channels.map((c) => {
          const info = syncState(c);
          const dis = info.supported ? "" : " disabled";
          return `
        <div class="sync-row${c.uid === context.state.selectedUid ? " is-main" : ""}" data-uid="${escapeHtml(c.uid)}">
          <div class="sync-row-top">
            <span class="sync-name">${escapeHtml(displayChannelName(c))}${c.uid === context.state.selectedUid ? ' <em class="channel-list-main">메인</em>' : ""}</span>
            <span class="sync-values"><span>싱크 <i data-k="offset">0초</i></span><span>지연 <i data-k="delay">-</i></span></span>
          </div>
          ${info.supported ? "" : `<div class="sync-note">${info.note}</div>`}
          <div class="sync-btns">
            <button type="button" data-step="-0.5" title="0.5초 뒤로 당기기"${dis}>-0.5</button>
            <button type="button" data-step="-0.1" title="0.1초 뒤로 당기기"${dis}>-0.1</button>
            <button type="button" data-step="0.1" title="0.1초 앞으로 밀기"${dis}>+0.1</button>
            <button type="button" data-step="0.5" title="0.5초 앞으로 밀기"${dis}>+0.5</button>
            <button type="button" data-latest title="재생 가능한 최신 지점으로 이동"${dis}>최신으로</button>
            <button type="button" data-reset title="이 방송의 싱크 조정을 초기화"${dis}>초기화</button>
          </div>
        </div>`;
        }).join("") : '<div class="volume-empty">방송을 추가하면 싱크를 조정할 수 있습니다.</div>';
      }
      list.querySelectorAll(".sync-row").forEach((row) => {
        const uid = row.dataset.uid;
        const offset = syncOffsets.get(uid) || 0;
        const stat = syncDelays.get(uid);
        const fresh = stat && Date.now() - stat.t <= SYNC_STATE_STALE_MS && Number.isFinite(stat.delay);
        const offsetEl = row.querySelector('[data-k="offset"]');
        const delayEl = row.querySelector('[data-k="delay"]');
        const offsetText = formatSyncSeconds(offset);
        const delayText = fresh ? `${stat.delay.toFixed(1)}초` : "-";
        if (offsetEl.textContent !== offsetText) offsetEl.textContent = offsetText;
        offsetEl.classList.toggle("is-adjusted", offset !== 0);
        if (delayEl.textContent !== delayText) delayEl.textContent = delayText;
        const resetBtn = row.querySelector("[data-reset]");
        if (resetBtn && !row.querySelector(".sync-note")) resetBtn.disabled = offset === 0;
      });
    }
    function clearAllSyncState() {
      syncOffsets.clear();
      syncDelays.clear();
      syncPending.clear();
      scheduleSyncRender();
    }
    return { externalSeek, adjustSync, resetSync, resetAllSync, clearSyncState, clearAllSyncState, handleSyncResult, handleSyncState, scheduleSyncRender, renderSyncUI };
  } };

  // src/viewer/screenshot-crop.js
  var screenshotCrop = { attach(img, host, onChange = () => {
  }, initial = {}) {
    const box = document.createElement("div");
    box.className = "screenshot-crop";
    box.setAttribute("aria-label", "저장할 이미지 영역");
    for (const corner of ["nw", "n", "ne", "w", "e", "sw", "s", "se"]) {
      const handle = document.createElement("span");
      handle.className = "crop-handle " + corner;
      handle.dataset.corner = corner;
      box.appendChild(handle);
    }
    const size = document.createElement("span");
    size.className = "crop-size";
    box.appendChild(size);
    const grid = document.createElement("div");
    grid.className = "crop-grid";
    box.appendChild(grid);
    host.appendChild(box);
    let selection = { x: 0, y: 0, width: 1, height: 1, ...initial.selection }, drag = null, enabled = initial.enabled === true;
    box.hidden = !enabled;
    function render() {
      box.style.left = selection.x * 100 + "%";
      box.style.top = selection.y * 100 + "%";
      box.style.width = selection.width * 100 + "%";
      box.style.height = selection.height * 100 + "%";
      size.textContent = `${Math.round(selection.width * img.naturalWidth)} × ${Math.round(selection.height * img.naturalHeight)}`;
      onChange(selection);
    }
    const point = (event) => {
      const r = host.getBoundingClientRect();
      return { x: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)) };
    };
    host.onpointerdown = (event) => {
      if (!enabled || event.button !== 0) return;
      event.preventDefault();
      const p = point(event);
      drag = { start: p, original: { ...selection }, corner: event.target.dataset.corner, move: (event.target === box || event.target === size) && !(selection.width === 1 && selection.height === 1) };
      if (!drag.corner && !drag.move) {
        selection = { x: p.x, y: p.y, width: 0, height: 0 };
      }
      host.setPointerCapture(event.pointerId);
      render();
    };
    host.onpointermove = (event) => {
      if (!drag) return;
      const p = point(event), o = drag.original;
      if (drag.move) {
        selection = { ...o, x: Math.max(0, Math.min(1 - o.width, o.x + p.x - drag.start.x)), y: Math.max(0, Math.min(1 - o.height, o.y + p.y - drag.start.y)) };
      } else {
        if (drag.corner) {
          let left = o.x, right = o.x + o.width, top = o.y, bottom = o.y + o.height;
          if (drag.corner.includes("w")) left = p.x;
          if (drag.corner.includes("e")) right = p.x;
          if (drag.corner.includes("n")) top = p.y;
          if (drag.corner.includes("s")) bottom = p.y;
          selection = { x: Math.min(left, right), y: Math.min(top, bottom), width: Math.abs(right - left), height: Math.abs(bottom - top) };
        } else {
          const anchor = drag.start;
          selection = { x: Math.min(anchor.x, p.x), y: Math.min(anchor.y, p.y), width: Math.abs(p.x - anchor.x), height: Math.abs(p.y - anchor.y) };
        }
      }
      render();
    };
    const end = () => {
      drag = null;
      if (selection.width * img.naturalWidth < 1 || selection.height * img.naturalHeight < 1) {
        selection = { x: 0, y: 0, width: 1, height: 1 };
        render();
      }
    };
    host.onpointerup = end;
    host.onpointercancel = end;
    img.onload = render;
    render();
    return { getState() {
      return { selection: { ...selection }, enabled };
    }, isEnabled() {
      return enabled;
    }, reset() {
      selection = { x: 0, y: 0, width: 1, height: 1 };
      render();
    }, setEnabled(value) {
      enabled = value;
      box.hidden = !enabled;
      onChange(selection);
    }, async blob() {
      await img.decode();
      const area = enabled ? selection : { x: 0, y: 0, width: 1, height: 1 };
      const x = Math.min(img.naturalWidth - 1, Math.round(area.x * img.naturalWidth)), y = Math.min(img.naturalHeight - 1, Math.round(area.y * img.naturalHeight));
      const width = Math.max(1, Math.min(img.naturalWidth - x, Math.round(area.width * img.naturalWidth))), height = Math.max(1, Math.min(img.naturalHeight - y, Math.round(area.height * img.naturalHeight)));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      try {
        canvas.getContext("2d").drawImage(img, x, y, width, height, 0, 0, width, height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw Error("이미지를 저장할 수 없습니다.");
        return blob;
      } finally {
        canvas.width = canvas.height = 0;
      }
    } };
  } };

  // src/shared/runtime/scope.ts
  var ResourceScope = class {
    constructor(report = console.error) {
      this.report = report;
    }
    report;
    cleanups = /* @__PURE__ */ new Set();
    disposed = false;
    get isDisposed() {
      return this.disposed;
    }
    get size() {
      return this.cleanups.size;
    }
    add(cleanup) {
      let active = true;
      const release = () => {
        if (!active) return;
        active = false;
        this.cleanups.delete(release);
        try {
          cleanup();
        } catch (error) {
          this.report(error);
        }
      };
      if (this.disposed) release();
      else this.cleanups.add(release);
      return release;
    }
    listen(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      return this.add(() => target.removeEventListener(type, listener, options));
    }
    observe(observer) {
      return this.add(() => observer.disconnect());
    }
    timeout(callback, milliseconds) {
      let release = () => {
      };
      const id = globalThis.setTimeout(() => {
        release();
        callback();
      }, milliseconds);
      release = this.add(() => globalThis.clearTimeout(id));
      return release;
    }
    interval(callback, milliseconds) {
      const id = globalThis.setInterval(callback, milliseconds);
      return this.add(() => globalThis.clearInterval(id));
    }
    frame(callback) {
      let release = () => {
      };
      const id = globalThis.requestAnimationFrame((time) => {
        release();
        callback(time);
      });
      release = this.add(() => globalThis.cancelAnimationFrame(id));
      return release;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const release of [...this.cleanups].reverse()) release();
    }
  };

  // src/shared/media/limits.ts
  var MAX_SCREENSHOTS = 12;
  var MAX_PENDING_SCREENSHOTS = 2;
  var MAX_SCREENSHOT_BYTES = 128 * 1024 * 1024;
  var MAX_RECORDING_BYTES = 256 * 1024 * 1024;
  var MAX_TRANSFER_BYTES = MAX_RECORDING_BYTES + 16 * 1024 * 1024;
  var DOWNLOAD_URL_MS = 1e4;

  // src/shared/media/object-urls.ts
  var ObjectURLs = class {
    scope = new ResourceScope();
    urls = /* @__PURE__ */ new Map();
    get size() {
      return this.urls.size;
    }
    create(blob, lifetime) {
      if (this.scope.isDisposed) throw Error("이미 종료된 미디어 화면입니다.");
      const url = URL.createObjectURL(blob);
      let cancel = () => {
      };
      const release = this.scope.add(() => {
        cancel();
        URL.revokeObjectURL(url);
        this.urls.delete(url);
      });
      this.urls.set(url, release);
      if (lifetime !== void 0) cancel = this.scope.timeout(release, lifetime);
      return { url, release };
    }
    dispose() {
      this.scope.dispose();
    }
  };

  // src/viewer/screenshot-gallery.js
  var screenshotGallery = { create({ host, download, onClose }) {
    const scope = new ResourceScope();
    const urls = new ObjectURLs();
    scope.add(() => urls.dispose());
    const saving = /* @__PURE__ */ new WeakSet();
    const items = [];
    let index = -1, crop = null, url = null, drag = null, closed = false;
    const panel = document.createElement("section");
    panel.className = "media-dialog screenshot-dialog screenshot-gallery";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "스크린샷 목록");
    panel.innerHTML = '<header><strong>스크린샷 미리보기</strong><button class="gallery-close" type="button" aria-label="닫기">✕</button></header><div class="media-body"></div><footer class="media-footer"><div class="gallery-tools"><button class="gallery-crop-toggle" type="button" aria-pressed="false">자르기</button><button class="gallery-reset" type="button">영역 초기화</button><span class="screenshot-size"></span></div><div class="gallery-navigation"><button class="gallery-prev" type="button" aria-label="이전 이미지">‹</button><span class="gallery-index"></span><button class="gallery-next" type="button" aria-label="다음 이미지">›</button></div><div class="gallery-actions"><button class="media-copy" type="button">이미지 복사</button><button class="media-save" type="button">이미지 저장</button></div></footer><p class="gallery-status" role="status"></p>';
    host.appendChild(panel);
    const $ = (selector) => panel.querySelector(selector), body = $(".media-body"), status = $(".gallery-status");
    function update() {
      const item = items[index];
      if (!item) return;
      $(".media-save").disabled = saving.has(item);
      $(".gallery-index").textContent = `${index + 1} / ${items.length}`;
      $(".gallery-prev").disabled = index === 0;
      $(".gallery-next").disabled = index === items.length - 1;
      const enabled = crop?.isEnabled() === true;
      $(".gallery-crop-toggle").setAttribute("aria-pressed", String(enabled));
      $(".gallery-reset").disabled = !enabled;
      $(".media-copy").textContent = enabled ? "선택 영역 복사" : "이미지 복사";
      $(".media-save").textContent = enabled ? "선택 영역 저장" : "이미지 저장";
      const img = body.querySelector("img");
      $(".screenshot-size").textContent = img?.naturalWidth ? `${img.naturalWidth} × ${img.naturalHeight}px` : "";
      clamp();
    }
    function release() {
      body.querySelector("img")?.removeAttribute("src");
      url?.release();
      url = null;
    }
    function show(next) {
      if (next < 0 || next >= items.length || closed) return;
      if (index >= 0 && crop) items[index].cropState = crop.getState();
      release();
      index = next;
      crop = null;
      body.replaceChildren();
      status.textContent = "";
      const img = document.createElement("img");
      img.draggable = false;
      img.alt = `스크린샷 ${index + 1}`;
      const area = document.createElement("div");
      area.className = "screenshot-crop-host";
      area.appendChild(img);
      body.appendChild(area);
      crop = screenshotCrop.attach(img, area, update, items[index].cropState);
      url = urls.create(items[index].blob);
      img.src = url.url;
      update();
    }
    function close() {
      if (closed) return;
      closed = true;
      release();
      items.length = 0;
      crop = null;
      drag = null;
      panel.remove();
      scope.dispose();
      onClose();
    }
    function clamp() {
      const img = body.querySelector("img"), area = body.firstElementChild;
      if (img?.naturalWidth && area) {
        const style = getComputedStyle(body), paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight), paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const chromeHeight = $("header").offsetHeight + $("footer").offsetHeight + status.getBoundingClientRect().height;
        const statusStyle = getComputedStyle(status), statusMargin = parseFloat(statusStyle.marginTop) + parseFloat(statusStyle.marginBottom);
        const availableHeight = Math.max(1, parseFloat(getComputedStyle(panel).maxHeight) - chromeHeight - statusMargin - paddingY - 2);
        area.style.width = Math.max(1, Math.min(body.clientWidth - paddingX, availableHeight * img.naturalWidth / img.naturalHeight)) + "px";
      }
      const r = panel.getBoundingClientRect();
      panel.style.right = "auto";
      panel.style.left = `${Math.max(0, Math.min(r.left, innerWidth - r.width))}px`;
      panel.style.top = `${Math.max(0, Math.min(r.top, innerHeight - Math.min(r.height, innerHeight)))}px`;
    }
    const sizeObserver = new ResizeObserver(clamp);
    sizeObserver.observe(panel);
    scope.observe(sizeObserver);
    const header = $("header");
    header.onpointerdown = (event) => {
      if (event.button !== 0 || event.target.closest("button,input,label")) return;
      event.preventDefault();
      const r = panel.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: r.left, top: r.top };
      header.setPointerCapture(event.pointerId);
    };
    header.onpointermove = (event) => {
      if (!drag) return;
      panel.style.right = "auto";
      panel.style.left = drag.left + event.clientX - drag.x + "px";
      panel.style.top = drag.top + event.clientY - drag.y + "px";
      clamp();
    };
    header.onpointerup = header.onpointercancel = () => {
      drag = null;
    };
    scope.listen(window, "resize", clamp);
    scope.listen(window, "pagehide", (event) => {
      if (!event.persisted) close();
    });
    $(".gallery-close").onclick = close;
    $(".gallery-prev").onclick = () => show(index - 1);
    $(".gallery-next").onclick = () => show(index + 1);
    $(".gallery-crop-toggle").onclick = () => {
      crop.setEnabled(!crop.isEnabled());
      update();
    };
    $(".gallery-reset").onclick = () => crop.reset();
    $(".media-save").onclick = async () => {
      const item = items[index], controller = crop;
      if (!item || !controller || saving.has(item)) return;
      saving.add(item);
      update();
      try {
        const blob = await controller.blob();
        if (closed) return;
        await download(blob, item.name + ".png");
        if (closed) return;
        const current = items[index], position = items.indexOf(item);
        if (position < 0) return;
        if (current === item) {
          release();
          crop = null;
        }
        items.splice(position, 1);
        if (!items.length) {
          close();
          return;
        }
        if (current === item) {
          index = -1;
          show(Math.min(position, items.length - 1));
        } else {
          index = items.indexOf(current);
          update();
        }
        status.textContent = "이미지를 저장했습니다.";
      } catch (error) {
        if (!closed) status.textContent = error.message;
      } finally {
        saving.delete(item);
        if (!closed) update();
      }
    };
    $(".media-copy").onclick = async () => {
      try {
        const blob = await crop.blob();
        if (closed) return;
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        if (!closed) status.textContent = "이미지를 복사했습니다.";
      } catch (error) {
        if (!closed) status.textContent = "이미지 복사 실패: " + error.message;
      }
    };
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
      if (["ArrowLeft", "ArrowRight"].includes(event.key) && !event.target.matches("input,select,textarea")) {
        event.preventDefault();
        event.stopPropagation();
        show(index + (event.key === "ArrowLeft" ? -1 : 1));
      }
    });
    return { get size() {
      return items.length;
    }, get bytes() {
      return items.reduce((bytes, item) => bytes + item.blob.size, 0);
    }, hasUnsaved: () => items.some((item) => !item.saved), add(item) {
      if (closed) throw Error("스크린샷 창이 닫혔습니다.");
      if (items.length >= MAX_SCREENSHOTS || items.reduce((bytes, item2) => bytes + item2.blob.size, 0) + item.blob.size > MAX_SCREENSHOT_BYTES) throw Error("스크린샷 보관 한도(12장·128MB)에 도달했습니다. 기존 이미지를 저장한 뒤 다시 촬영해주세요.");
      items.push(item);
      show(items.length - 1);
    }, close, containsEvent: (event) => event.composedPath().includes(panel) };
  } };

  // src/viewer/media-tools.js
  var mediaTools = { create(context) {
    const scope = new ResourceScope(), urls = new ObjectURLs(), transferAbort = new AbortController();
    scope.add(() => urls.dispose());
    scope.add(() => transferAbort.abort());
    const recordings = /* @__PURE__ */ new Map(), pending = /* @__PURE__ */ new Map(), positions = /* @__PURE__ */ new Map(), results = [];
    let openingResult = false, activeResult = null;
    let recordingProfile = "balanced", profileLoaded = false;
    let profileControl = null;
    function bindSettings() {
      profileControl = context.ui?.querySelector("#recordingProfile");
      if (!profileControl) return;
      profileControl.value = recordingProfile;
      profileControl.disabled = !profileLoaded;
      profileControl.onchange = () => {
        recordingProfile = profileControl.value === "original" ? "original" : "balanced";
        chrome.storage.local.set({ chzzkRecordingProfileV1: recordingProfile }).catch((error) => context.showNotice(error.message));
      };
    }
    chrome.storage.local.get("chzzkRecordingProfileV1").then((value) => {
      if (scope.isDisposed) return;
      recordingProfile = value.chzzkRecordingProfileV1 === "original" ? "original" : "balanced";
      profileLoaded = true;
      if (profileControl) {
        profileControl.value = recordingProfile;
        profileControl.disabled = false;
      }
    }).catch(() => {
      if (scope.isDisposed) return;
      profileLoaded = true;
      if (profileControl) profileControl.disabled = false;
    });
    let sequence = 0;
    const formats = [["video/webm;codecs=vp8,opus", "WebM"], ["video/webm;codecs=vp9,opus", "WebM"], ["video/mp4;codecs=avc1,mp4a.40.2", "MP4"], ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "MP4"]].filter(([mime]) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime));
    const uniqueFormats = formats.filter((f, i) => formats.findIndex((x) => x[1] === f[1]) === i);
    function frame(uid) {
      return context.tileMap.get(uid)?.querySelector("iframe");
    }
    function request(uid, type, extra = {}) {
      if (scope.isDisposed) throw Error("미디어 화면이 종료됐습니다.");
      const requestId = ++sequence;
      if (!CZMessages.postToPlayer(frame(uid), { source: "chzzk-multiview", type, requestId, ...extra })) throw Error("방송이 준비된 뒤 다시 시도하세요.");
      return requestId;
    }
    let gallery = null;
    function download(blob, name) {
      const lease = urls.create(blob, DOWNLOAD_URL_MS), a = document.createElement("a");
      a.href = lease.url;
      a.download = name;
      a.click();
    }
    async function fileName(uid, date = /* @__PURE__ */ new Date(), kind = "screenshot", controller = new AbortController()) {
      const channel = context.state.channels.find((c) => c.uid === uid);
      let title = "방송";
      const release = scope.add(() => controller.abort()), cancelTimeout = scope.timeout(() => controller.abort(), 15e3);
      try {
        const id = channel?.sourceId || uid;
        const path = channel?.type === "video" ? `service/v1/videos/${encodeURIComponent(id)}` : `service/v3.3/channels/${encodeURIComponent(id)}/live-detail`;
        const response = await fetch(`https://api.chzzk.naver.com/${path}`, { credentials: "include", signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          if (data.code === 200) title = data.content?.liveTitle || data.content?.videoTitle || title;
        }
      } catch (_) {
      } finally {
        cancelTimeout();
        release();
      }
      const stamp = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()].map((n, i) => i ? String(n).padStart(2, "0") : String(n)).join("");
      const clean = (value) => String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
      if (kind === "recording") return `[${String(date.getFullYear()).slice(-2)}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}]${clean(channel?.name || uid).slice(0, 70)}_${clean(title).slice(0, 70)}`;
      return `${clean(channel?.name || uid).slice(0, 70)}_${clean(title).slice(0, 70)}_${stamp}`;
    }
    async function screenshot(uid) {
      if (scope.isDisposed) return;
      if ([...pending.values()].filter((entry) => entry.kind === "screenshot").length >= MAX_PENDING_SCREENSHOTS) {
        context.showNotice("스크린샷 처리 중입니다. 잠시 후 다시 촬영해주세요.");
        return;
      }
      const shots = [...pending.values(), ...results.map((result) => result.entry), ...activeResult ? [activeResult.entry] : []].filter((entry) => entry.kind === "screenshot").length + (gallery?.size || 0);
      if (shots >= MAX_SCREENSHOTS) {
        context.showNotice("스크린샷은 최대 12장까지 보관합니다. 저장 후 다시 촬영해주세요.");
        return;
      }
      try {
        const id = request(uid, "MEDIA_SCREENSHOT"), controller = new AbortController(), entry = { uid, name: fileName(uid, void 0, void 0, controller), kind: "screenshot", controller };
        entry.cancel = scope.timeout(() => {
          if (pending.delete(id)) context.showNotice("스크린샷 응답이 없습니다.");
        }, 2e4);
        pending.set(id, entry);
      } catch (e) {
        context.showNotice(e.message);
      }
    }
    function recordingUids() {
      return /* @__PURE__ */ new Set([...recordings.keys(), ...[...pending.values()].filter((entry) => entry.kind === "recording").map((entry) => entry.uid)]);
    }
    function toggleRecording(uid) {
      if (scope.isDisposed) return;
      try {
        if (recordings.has(uid)) {
          request(uid, "MEDIA_STOP");
          return;
        }
        if (recordingUids().has(uid)) {
          context.showNotice("녹화 결과를 처리 중입니다. 잠시 기다려주세요.");
          return;
        }
        const mime = uniqueFormats.find(([, label]) => label === "MP4")?.[0] || uniqueFormats[0]?.[0];
        if (!mime) throw Error("이 환경에서는 녹화를 지원하지 않습니다.");
        const id = request(uid, "MEDIA_RECORD", { mime, profile: recordingProfile }), controller = new AbortController();
        pending.set(id, { uid, name: fileName(uid, /* @__PURE__ */ new Date(), "recording", controller), kind: "recording", controller });
        recordings.set(uid, { startedAt: Date.now() });
        updateRecord(uid);
      } catch (e) {
        context.showNotice(e.message);
      }
    }
    function updateRecord(uid) {
      const button = context.tileMap.get(uid)?.querySelector(".tile-record"), record = recordings.get(uid);
      if (!button) return;
      button.classList.toggle("recording", !!record);
      button.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor"/><circle cx="10" cy="10" r="5" fill="currentColor"/></svg>' + (record ? `<span>${Math.floor((Date.now() - record.startedAt) / 1e3)}초</span>` : "");
      button.title = record ? "녹화 중지 (R)" : "녹화 시작 (R)";
    }
    async function showNext() {
      if (scope.isDisposed || openingResult || !results.length) return;
      openingResult = true;
      const next = results.shift();
      activeResult = next;
      try {
        next.entry.name = await next.entry.name;
        if (!scope.isDisposed) await preview(next.data, next.entry);
      } catch (error) {
        if (!scope.isDisposed) context.showNotice(error.message);
      } finally {
        next.data = null;
        activeResult = null;
        openingResult = false;
        if (results.length) queueMicrotask(showNext);
      }
    }
    async function preview(data, entry) {
      if (!(data.blob instanceof Blob) || !data.blob.size) {
        context.showNotice("저장할 영상/이미지가 없습니다.");
        return;
      }
      const name = await entry.name;
      if (scope.isDisposed) return;
      if (data.kind === "recording") {
        const id = crypto.randomUUID();
        await (globalThis.CZ_SITE_VIEWER ? CZSiteRecordings : CZRecordings).put({ id, name, blob: data.blob, duration: data.duration, warning: data.warning, createdAt: Date.now() }, { signal: transferAbort.signal });
        if (scope.isDisposed) {
          await (globalThis.CZ_SITE_VIEWER ? CZSiteRecordings : CZRecordings).remove?.(id).catch(() => {
          });
          return;
        }
        const url = chrome.runtime.getURL(`src/viewer/recording.html?id=${encodeURIComponent(id)}`);
        try {
          if (globalThis.CZ_SITE_VIEWER) {
            const result = await chrome.runtime.sendMessage({ type: "SITE_OPEN_RECORDING", id });
            if (!result?.ok) throw Error(result?.error || "결과 창 열기 실패");
          } else await chrome.windows.create({ url, type: "popup", width: 900, height: 780 });
        } catch (error) {
          context.showNotice("결과 창을 열지 못했습니다. 녹화 결과는 보관되어 있습니다.");
          throw error;
        }
        return;
      }
      if (scope.isDisposed) return;
      if (!gallery) gallery = screenshotGallery.create({ host: context.ui, download, onClose: () => {
        gallery = null;
      } });
      gallery.add({ blob: data.blob, name });
    }
    function attachTile(uid, tile) {
      const bar = document.createElement("div");
      bar.className = "media-transport";
      bar.innerHTML = '<input type="range" class="media-range" step="0.1" aria-label="방송 재생 위치" disabled><output class="media-seek-delta" hidden></output><span class="media-position" hidden>재생 위치 조회 중</span>';
      tile.appendChild(bar);
      const range = bar.querySelector("input"), hint = bar.querySelector(".media-seek-delta");
      let baseline = 0;
      const showDelta = () => {
        const delta = Number(range.value) - baseline;
        hint.textContent = `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}초`;
        hint.hidden = false;
        hint.style.left = `${Math.max(0, Math.min(100, (Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min)) * 100))}%`;
      };
      const endDrag = () => {
        range.dataset.dragging = "false";
        hint.hidden = true;
      };
      range.onpointerdown = () => {
        baseline = positions.get(uid)?.time ?? Number(range.value);
        range.dataset.dragging = "true";
      };
      range.oninput = () => {
        if (range.dataset.dragging !== "true") baseline = positions.get(uid)?.time ?? Number(range.value);
        showDelta();
      };
      range.onchange = () => {
        endDrag();
        try {
          request(uid, "MEDIA_SEEK", { time: Number(range.value) });
        } catch (e) {
          context.showNotice(e.message);
        }
      };
      range.onpointerup = endDrag;
      range.onpointercancel = endDrag;
      range.onblur = endDrag;
    }
    function receive(data) {
      if (scope.isDisposed) return;
      if (data.type === "MEDIA_KEY") {
        if (data.action === "screenshot") screenshot(data.uid);
        else if (data.action === "record") toggleRecording(data.uid);
        else if (context.shortcutsEnabled !== false) {
          if (data.action === "shortcut") context.onShortcut?.(data.key);
          else if ([-3, 3].includes(data.delta)) context.adjustSync(data.uid, data.delta);
        }
        return;
      }
      if (data.type === "MEDIA_STATE") {
        if (data.recording) recordings.set(data.uid, { startedAt: data.startedAt });
        else recordings.delete(data.uid);
        updateRecord(data.uid);
        return;
      }
      if (data.type === "MEDIA_TIME") {
        if (data.canSeek === false) {
          const bar2 = context.tileMap.get(data.uid)?.querySelector(".media-transport");
          if (bar2) {
            bar2.querySelector("input").disabled = true;
            bar2.querySelector(".media-position").textContent = "탐색 가능한 구간 없음";
          }
          return;
        }
        if (![data.start, data.end, data.time].every(Number.isFinite) || data.end <= data.start) return;
        positions.set(data.uid, data);
        const bar = context.tileMap.get(data.uid)?.querySelector(".media-transport");
        if (!bar) return;
        const range = bar.querySelector("input");
        range.disabled = false;
        range.min = data.start;
        range.max = data.end;
        if (range.dataset.dragging !== "true") range.value = data.time;
        bar.querySelector(".media-position").textContent = `${Math.floor(data.time - data.start)} / ${Math.floor(data.end - data.start)}초`;
        return;
      }
      if (data.type === "MEDIA_RESULT") {
        if (data.kind === "seek") {
          if (data.ok) context.externalSeek(data.uid, data.applied);
          else context.showNotice("재생 위치를 이동할 수 없습니다.");
          return;
        }
        const entry = pending.get(data.requestId);
        if (!entry || entry.uid !== data.uid) return;
        pending.delete(data.requestId);
        entry.cancel?.();
        if (data.error) {
          entry.controller?.abort();
          if (entry.kind === "recording") {
            recordings.delete(data.uid);
            updateRecord(data.uid);
          }
          context.showNotice(data.error);
          return;
        }
        if (data.kind !== entry.kind || !(data.blob instanceof Blob) || !data.blob.size) {
          entry.controller?.abort();
          if (entry.kind === "recording") {
            recordings.delete(data.uid);
            updateRecord(data.uid);
          }
          context.showNotice("저장할 영상/이미지가 없습니다.");
          return;
        }
        if (entry.kind === "screenshot") {
          const queued = (gallery?.bytes || 0) + results.filter((result) => result.entry.kind === "screenshot").reduce((bytes, result) => bytes + (result.data.blob?.size || 0), 0) + (activeResult?.entry.kind === "screenshot" ? activeResult.data?.blob?.size || 0 : 0);
          if (queued + (data.blob?.size || 0) > MAX_SCREENSHOT_BYTES) {
            entry.controller?.abort();
            context.showNotice("스크린샷 보관 한도 128MB에 도달했습니다. 기존 이미지를 저장한 뒤 다시 촬영해주세요.");
            return;
          }
        }
        results.push({ data, entry });
        showNext();
      }
    }
    scope.listen(window, "keydown", (event) => {
      const key = CZMessages.mediaShortcut(event);
      if (!key || CZMessages.isShortcutInput(event, key)) return;
      if (gallery?.containsEvent(event) && key.startsWith("Arrow")) return;
      if (!["s", "r"].includes(key) && context.shortcutsEnabled === false) return;
      if (["s", "r", "ArrowLeft", "ArrowRight"].includes(key) && !context.state.selectedUid) return;
      event.preventDefault();
      if (key === "s") screenshot(context.state.selectedUid);
      else if (key === "r") toggleRecording(context.state.selectedUid);
      else if (["ArrowLeft", "ArrowRight"].includes(key)) context.adjustSync(context.state.selectedUid, key === "ArrowLeft" ? -3 : 3);
      else context.onShortcut?.(key);
    }, { capture: true });
    scope.listen(window, "beforeunload", (event) => {
      if (recordings.size || pending.size || results.length || activeResult || gallery?.hasUnsaved()) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    scope.interval(() => recordings.forEach((_, uid) => updateRecord(uid)), 1e3);
    function detach(uid) {
      positions.delete(uid);
      recordings.delete(uid);
      for (const [id, entry] of pending) if (entry.uid === uid) {
        entry.cancel?.();
        entry.controller?.abort();
        pending.delete(id);
      }
    }
    function dispose() {
      if (scope.isDisposed) return;
      scope.dispose();
      gallery?.close();
      gallery = null;
      pending.clear();
      recordings.clear();
      positions.clear();
      results.length = 0;
      if (profileControl) profileControl.onchange = null;
      profileControl = null;
    }
    scope.listen(window, "pagehide", (event) => {
      if (!event.persisted) dispose();
    });
    return { dispose, detach, canDisplay(channels, layout) {
      const visible = new Set(channels.slice(0, layout === "main-sub" ? 4 : 9).map((channel) => channel.uid));
      if ([...recordingUids()].some((uid) => !visible.has(uid))) {
        context.showNotice("녹화 중인 방송이 화면에서 제거되지 않도록 녹화를 종료한 뒤 배치를 변경해주세요.");
        return false;
      }
      return true;
    }, bindSettings, screenshot, toggleRecording, attachTile, receive, hasRecordings: () => recordingUids().size > 0, isRecording: (uid) => recordingUids().has(uid) };
  } };

  // src/viewer/power-diagnostics.js
  var powerDiagnostics = { create(context) {
    let dialog = null, sequence = 0, requestId = null;
    const results = /* @__PURE__ */ new Map();
    let timeout = null;
    function render() {
      if (!dialog) return;
      const rows = dialog.querySelector(".power-diagnostic-rows");
      rows.replaceChildren();
      for (const [uid, value] of results) {
        const row = document.createElement("p"), name = context.state.channels.find((channel) => channel.uid === uid)?.name || uid;
        row.textContent = name + " — " + (value.pending ? "조회 중" : value.error ? "확인 실패" : value.video && !value.video.paused && value.video.readyState >= 2 ? "재생 중 · 점검 수집됨" : "재생 상태 확인 필요");
        rows.append(row);
      }
    }
    function open() {
      if (!dialog) {
        dialog = document.createElement("dialog");
        dialog.className = "ic-dialog power-diagnostics";
        dialog.innerHTML = '<header><strong>통나무 파워 점검</strong><button class="power-diagnostic-close" type="button" aria-label="통나무 파워 점검 닫기">✕</button></header><p class="power-diagnostic-help">설정의 통나무 수집 보조는 원본 구성요소 유지와 보너스 버튼 클릭을 시도합니다. 실제 적립 성공을 보장하지 않습니다. 여기서는 각 타일의 상태와 최근 요청 경로를 읽기 전용으로 확인합니다.</p><div class="power-diagnostic-rows"></div><p class="power-diagnostic-status" role="status"></p><button class="power-diagnostic-copy" type="button">점검 정보 복사</button>';
        context.ui.append(dialog);
        dialog.addEventListener("close", () => {
          clearTimeout(timeout);
          requestId = null;
          results.clear();
          dialog.querySelector(".power-diagnostic-rows").replaceChildren();
        });
        dialog.querySelector(".power-diagnostic-close").onclick = () => dialog.close();
        dialog.querySelector(".power-diagnostic-copy").onclick = async () => {
          try {
            await navigator.clipboard.writeText(JSON.stringify({ version: chrome.runtime.getManifest?.().version || "2.0.3", channels: [...results].map(([uid, value]) => ({ uid, ...value })) }, null, 2));
            dialog.querySelector(".power-diagnostic-status").textContent = "쿠키·헤더·쿼리값 없이 점검 정보를 복사했습니다.";
          } catch (_) {
            dialog.querySelector(".power-diagnostic-status").textContent = "점검 정보 복사에 실패했습니다.";
          }
        };
      }
      if (!dialog.open) dialog.showModal();
      clearTimeout(timeout);
      results.clear();
      requestId = ++sequence;
      for (const channel of context.state.channels) {
        if (channel.type === "video") continue;
        const frame = context.tileMap.get(channel.uid)?.querySelector("iframe");
        if (!frame) continue;
        results.set(channel.uid, { pending: true });
        if (!CZMessages.postToPlayer(frame, { source: "chzzk-multiview", type: "POWER_DIAGNOSTICS", requestId })) results.set(channel.uid, { error: "프레임이 준비되지 않았습니다." });
      }
      render();
      timeout = setTimeout(() => {
        for (const [uid, value] of results) if (value.pending) results.set(uid, { error: "응답 시간 초과" });
        render();
      }, 8e3);
    }
    window.addEventListener("pagehide", () => clearTimeout(timeout), { once: true });
    return { open, receive(data) {
      if (data.requestId !== requestId || !results.has(data.uid)) return;
      results.set(data.uid, data.error ? { error: data.error } : data.diagnostics || { error: "점검 응답 없음" });
      render();
    } };
  } };

  // src/viewer/chat-renderer.ts
  function create(list) {
    const rendered = /* @__PURE__ */ new Map();
    function image(src, alt, className) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = alt;
      img.title = alt;
      img.className = className;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.draggable = false;
      img.onerror = () => {
        const label = document.createElement("span");
        label.textContent = alt;
        img.replaceWith(label);
      };
      return img;
    }
    function render(items) {
      const scrollTop = list.scrollTop, atBottom = list.scrollHeight - scrollTop - list.clientHeight < 16;
      const ids = new Set(items.map((item) => item.id));
      for (const [id, entry] of rendered) if (!ids.has(id)) {
        entry.node.remove();
        rendered.delete(id);
      }
      list.querySelector(".ic-empty")?.remove();
      items.forEach((item, index) => {
        const signature = JSON.stringify(item);
        let entry = rendered.get(item.id);
        if (!entry || entry.signature !== signature) {
          const row = document.createElement("div");
          row.className = "ic-message";
          row.dataset.role = item.role;
          const time = document.createElement("time");
          if (item.time !== null && Number.isFinite(item.time)) {
            time.dateTime = new Date(item.time).toISOString();
            time.textContent = new Date(item.time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
          } else {
            time.hidden = true;
            time.title = "원본 작성 시각 확인 불가";
          }
          const author = document.createElement("strong");
          author.className = "ic-author";
          author.textContent = item.name;
          const text = document.createElement("span");
          text.className = "ic-message-text";
          for (const part of item.segments) text.appendChild(part.type === "image" ? image(part.src, part.alt, "ic-emote") : document.createTextNode(part.text));
          row.append(time, author, document.createTextNode(" "), text);
          entry?.node.replaceWith(row);
          entry = { node: row, signature };
          rendered.set(item.id, entry);
        }
        if (list.children[index] !== entry.node) list.insertBefore(entry.node, list.children[index] || null);
      });
      list.scrollTop = atBottom ? list.scrollHeight : scrollTop;
    }
    function clear() {
      for (const entry of rendered.values()) entry.node.remove();
      rendered.clear();
    }
    return { render, clear };
  }

  // src/viewer/important-chat.js
  var importantChatPanel = { create({ chatPanel, enabledControl, getFrame, getState, notify }) {
    const scope = new ResourceScope();
    const model = CZImportantChat.create();
    let filter = CZImportantChat.settings(), ready = false;
    const configured = /* @__PURE__ */ new WeakMap();
    const owners = /* @__PURE__ */ new Map(), presented = /* @__PURE__ */ new WeakMap();
    let stats = null, received = 0;
    const HEIGHT_KEY = "chzzkImportantChatHeightV1";
    let desiredHeight = 200, drag = null, expanded = false;
    const panel = document.createElement("section");
    panel.className = "important-chat-panel";
    panel.setAttribute("aria-label", "주요 채팅");
    panel.dataset.collapsed = "true";
    panel.innerHTML = '<header class="ic-heading"><button type="button" class="ic-toggle" aria-expanded="false" aria-controls="cz-collected-chat-body">주요 채팅</button><button type="button" class="ic-header-settings" title="수집 설정·점검" aria-label="수집 설정·점검"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m9 3-.5 2-2 1-2-.5-2 3 1.5 1.5v3L2.5 15l2 3 2-.5 2 1 .5 2h4l.5-2 2-1 2 .5 2-3-1.5-1.5v-3L20 9l-2-3-2 .5-2-1-.5-2Z"/><circle cx="11.5" cy="12" r="3"/></svg></button></header><div id="cz-collected-chat-body" class="ic-body"><div class="ic-list" tabindex="0" role="region" aria-label="수집된 채팅 목록"></div></div><div class="ic-resizer" role="separator" aria-label="주요 채팅 영역 높이" aria-orientation="horizontal" tabindex="0"></div><dialog class="ic-dialog" aria-labelledby="icSettingsTitle"><header><strong id="icSettingsTitle">채팅 설정</strong><button class="ic-settings-close" type="button" aria-label="채팅 설정 닫기">✕</button></header><div class="ic-settings"><strong class="ic-settings-heading">주요 채팅 모음</strong><div class="ic-options"></div><p class="ic-role-help">역할 배지·표식을 우선 확인하고, 채팅 본문의 주황·파랑·초록색을 보조 기준으로 사용합니다. 닉네임 색은 사용하지 않습니다.</p><form class="ic-form"><input class="ic-name" maxlength="40" placeholder="추가할 닉네임" aria-label="주요 채팅 사용자 닉네임"><button type="submit">추가</button></form><div class="ic-names"></div><form class="ic-exclude-form"><input class="ic-exclude-name" maxlength="40" placeholder="제외할 닉네임" aria-label="수집에서 제외할 닉네임"><button type="submit">제외</button></form><div class="ic-excluded-names ic-names"></div><p class="ic-exclude-help">제외 목록은 자동 포함·추가 목록보다 우선합니다.</p><footer class="ic-settings-footer"><button class="ic-clear" type="button">수집된 내용 초기화</button><details class="ic-debug"><summary>수집 점검</summary><p class="ic-diagnostics"></p><button class="ic-copy-diagnostics" type="button">점검 정보 복사</button></details></footer></div></dialog>';
    chatPanel.insertBefore(panel, chatPanel.querySelector(".chat-frame-wrap"));
    const dialog = panel.querySelector(".ic-dialog"), $ = (selector) => panel.querySelector(selector) || dialog.querySelector(selector), handle = $(".ic-resizer");
    chatPanel.appendChild(dialog);
    const renderer = create($(".ic-list"));
    $(".ic-toggle").title = "접혀 있어도 주요 채팅은 계속 수집됩니다";
    $(".ic-toggle").onclick = () => {
      expanded = !expanded;
      panel.dataset.collapsed = String(!expanded);
      $(".ic-toggle").setAttribute("aria-expanded", String(expanded));
      render();
      resize();
      if (expanded) $(".ic-list").scrollTop = $(".ic-list").scrollHeight;
    };
    for (const [key, title] of [["streamers", "스트리머 자동 포함"], ["managers", "관리자 자동 포함"], ["partners", "파트너 자동 포함"]]) {
      const label = document.createElement("label");
      label.className = "ic-option";
      label.dataset.role = key;
      const text = document.createElement("span");
      text.textContent = title;
      const toggle = document.createElement("span");
      toggle.className = "settings-switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "ic-" + key;
      if (key === "enabled") input.id = "importantChatEnabled";
      input.setAttribute("role", "switch");
      input.setAttribute("aria-label", title);
      const track = document.createElement("span");
      track.className = "settings-switch-track";
      track.setAttribute("aria-hidden", "true");
      toggle.append(input, track);
      label.append(text, toggle);
      $(".ic-options").appendChild(label);
    }
    function openSettings() {
      controls();
      if (!dialog.open) dialog.showModal();
      diagnostics();
    }
    $(".ic-header-settings").onclick = openSettings;
    $(".ic-debug").ontoggle = () => diagnostics();
    $(".ic-settings-close").onclick = () => dialog.close();
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    function bounds() {
      const max = Math.max(64, chatPanel.clientHeight - 160);
      return { min: Math.min(100, max), max };
    }
    function resize() {
      if (scope.isDisposed) return;
      if (!chatPanel.clientHeight) return;
      const { min, max } = bounds(), height = Math.round(Math.max(min, Math.min(max, desiredHeight)));
      panel.style.setProperty("--ic-height", height + "px");
      present();
      handle.setAttribute("aria-valuemin", String(min));
      handle.setAttribute("aria-valuemax", String(max));
      handle.setAttribute("aria-valuenow", String(height));
    }
    function storeHeight() {
      chrome.storage.local.set({ [HEIGHT_KEY]: desiredHeight }).catch((error) => notify("주요 채팅 높이 저장 실패: " + error.message));
    }
    handle.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag = { y: event.clientY, height: panel.getBoundingClientRect().height };
      chatPanel.classList.add("ic-resizing");
      handle.setPointerCapture(event.pointerId);
    };
    handle.onpointermove = (event) => {
      if (!drag) return;
      const { min, max } = bounds();
      desiredHeight = Math.round(Math.max(min, Math.min(max, drag.height + (event.clientY - drag.y))));
      resize();
    };
    function endResize() {
      if (!drag) return;
      drag = null;
      chatPanel.classList.remove("ic-resizing");
      storeHeight();
    }
    handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = endResize;
    handle.onkeydown = (event) => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const { min, max } = bounds(), step = event.shiftKey ? 50 : 10;
      desiredHeight = Math.max(min, Math.min(max, event.key === "Home" ? min : event.key === "End" ? max : Number(handle.getAttribute("aria-valuenow")) + (event.key === "ArrowDown" ? step : -step)));
      resize();
      storeHeight();
    };
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(chatPanel);
    scope.observe(sizeObserver);
    resize();
    scope.listen(window, "pagehide", (event) => {
      if (!event.persisted) dispose();
    });
    function present() {
      if (scope.isDisposed) return;
      const frame = getFrame();
      if (!frame) return;
      const channel = getState().channels.find((c) => c.uid === getState().selectedUid);
      const name = channel?.name || channel?.uid || "";
      if (presented.get(frame) === name) return;
      if (CZMessages.postToPlayer(frame, { source: "chzzk-multiview", type: "CHAT_PRESENTATION", name, height: 0 })) presented.set(frame, name);
    }
    function diagnostics() {
      if (!dialog.open || !$(".ic-debug").open) return;
      const owner = owners.get(getState().selectedUid);
      const number = (key) => Number.isFinite(stats?.[key]) ? Math.max(0, Math.floor(stats[key])) : 0;
      $(".ic-diagnostics").textContent = (filter.enabled ? "수집 켜짐" : "수집 꺼짐") + " · 스트리머 확인: " + (owner?.name || (owner?.pending ? "조회 중" : "확인 안 됨")) + "\n" + (!stats ? "수집 프레임 응답 대기" : "읽은 항목 " + number("scanned") + " · 해석 " + number("parsed") + " · 대상 " + number("matched") + " · 전송 " + number("sent")) + " · 수신 " + received + " · 표시 " + model.items.length;
    }
    function resolveOwner() {
      const uid = getState().selectedUid;
      if (!ready || getState().chatOpen === false || !uid || owners.has(uid) || !filter.enabled) return;
      const channel = getState().channels.find((c) => c.uid === uid);
      if (!channel) return;
      owners.set(uid, { pending: true, name: "" });
      const request = channel.type === "video" ? CZChzzkApi.fetchVideoChannelName(channel.sourceId || uid.replace(/^video:/, "")) : CZChzzkApi.fetchChannelName(channel.sourceId || uid);
      Promise.resolve(request).then((name) => {
        if (scope.isDisposed) return;
        owners.set(uid, { pending: false, name: typeof name === "string" ? name : "" });
        if (getState().selectedUid === uid) {
          configure();
          diagnostics();
        }
      }).catch(() => {
        if (scope.isDisposed) return;
        owners.set(uid, { pending: false, name: "" });
        diagnostics();
      });
    }
    function configure() {
      if (scope.isDisposed) return;
      present();
      resolveOwner();
      const frame = getFrame();
      if (!ready || !frame || frame.dataset.playerReady !== "true") return;
      const signature = JSON.stringify([frame.dataset.uid, filter, owners.get(frame.dataset.uid)?.name || ""]);
      if (configured.get(frame) === signature) return;
      if (CZMessages.postToPlayer(frame, { source: "chzzk-multiview", type: "IMPORTANT_CHAT_CONFIG", settings: filter, streamerName: owners.get(frame.dataset.uid)?.name || "" })) configured.set(frame, signature);
    }
    function render() {
      if (scope.isDisposed) return;
      panel.hidden = ready && !filter.enabled;
      present();
      panel.dataset.collectedCount = String(model.items.length);
      if (expanded && !panel.hidden) renderer.render(model.items);
      diagnostics();
    }
    function controls() {
      [...panel.querySelectorAll("input,button"), ...dialog.querySelectorAll("input,button,select")].forEach((el) => el.disabled = !ready);
      enabledControl.checked = filter.enabled;
      enabledControl.disabled = !ready;
      for (const key of ["streamers", "managers", "partners"]) $(".ic-" + key).checked = filter[key];
      excludedControls();
      $(".ic-names").replaceChildren();
      filter.names.forEach((name, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = name + " ×";
        button.title = "추가 목록에서 삭제";
        button.onclick = () => save({ ...filter, names: filter.names.filter((_, i) => i !== index) });
        $(".ic-names").appendChild(button);
      });
    }
    function excludedControls() {
      $(".ic-excluded-names").replaceChildren();
      filter.excludedNames.forEach((name, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = name + " ×";
        button.title = "수집 제외 해제";
        button.onclick = () => save({ ...filter, excludedNames: filter.excludedNames.filter((_, i) => i !== index) });
        $(".ic-excluded-names").appendChild(button);
      });
    }
    function save(value) {
      filter = CZImportantChat.settings(value);
      model.applySettings(filter);
      controls();
      configure();
      render();
      chrome.storage.local.set({ [CZImportantChat.KEY]: filter }).catch((error) => notify("채팅 설정 저장 실패: " + error.message));
    }
    enabledControl.onchange = (event) => save({ ...filter, enabled: event.target.checked });
    for (const key of ["streamers", "managers", "partners"]) $(".ic-" + key).onchange = (event) => save({ ...filter, [key]: event.target.checked });
    $(".ic-exclude-form").onsubmit = (event) => {
      event.preventDefault();
      const input = $(".ic-exclude-name");
      if (!input.value.trim()) return;
      if (filter.excludedNames.length >= 50) {
        notify("제외 사용자는 최대 50명까지 지정할 수 있습니다.");
        return;
      }
      save({ ...filter, excludedNames: [...filter.excludedNames, input.value] });
      input.value = "";
    };
    $(".ic-form").onsubmit = (event) => {
      event.preventDefault();
      const input = $(".ic-name");
      if (!input.value.trim()) return;
      if (filter.names.length >= 50) {
        notify("사용자는 최대 50명까지 지정할 수 있습니다.");
        return;
      }
      save({ ...filter, names: [...filter.names, input.value] });
      input.value = "";
    };
    $(".ic-copy-diagnostics").onclick = async () => {
      const structure = {};
      for (const key of ["row", "nickname", "text", "timestampSource", "timestampFields"]) structure[key] = typeof stats?.structure?.[key] === "string" ? stats.structure[key].slice(0, 180) : "";
      structure.authorDecorations = Array.isArray(stats?.structure?.authorDecorations) ? stats.structure.authorDecorations.slice(0, 8).map((value) => Object.fromEntries(["tag", "class", "alt", "asset"].map((key) => [key, typeof value?.[key] === "string" ? value[key].slice(0, 120) : ""]))) : [];
      const counts = {};
      for (const key of ["scanned", "parsed", "matched", "sent", "restored"]) counts[key] = Number.isFinite(stats?.[key]) ? Math.max(0, Math.floor(stats[key])) : 0;
      const dom = { sourceTimeReader: String(stats?.dom?.sourceTimeReader || "").slice(0, 40), rowCandidates: Number(stats?.dom?.rowCandidates) || 0, nicknameCandidates: Number(stats?.dom?.nicknameCandidates) || 0, classes: Array.isArray(stats?.dom?.classes) ? stats.dom.classes.filter((value) => typeof value === "string").map((value) => value.slice(0, 160)).slice(-40) : [] };
      const roleSample = Array.isArray(stats?.roleSample) ? stats.roleSample.slice(0, 8).map((value) => ({ tag: String(value?.tag || "").slice(0, 20), labels: Array.isArray(value?.labels) ? value.labels.filter((item) => typeof item === "string").slice(0, 4).map((item) => item.slice(0, 80)) : [], markers: Array.isArray(value?.markers) ? value.markers.filter((item) => typeof item === "string").slice(0, 3).map((item) => item.slice(0, 120)) : [] })) : [];
      const report = { dom, roleSample, historyEntries: Number(stats?.historyEntries) || 0, collectorRevision: typeof stats?.revision === "string" ? stats.revision.slice(0, 40) : "응답 없음", version: chrome.runtime.getManifest?.().version || "2.0.3", enabled: filter.enabled, streamers: filter.streamers, managers: filter.managers, partners: filter.partners, ownerKnown: !!owners.get(getState().selectedUid)?.name, frameReady: getFrame()?.dataset.playerReady === "true", counts, received, displayed: model.items.length, structure };
      try {
        await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
        notify("채팅 내용 없이 점검 정보를 복사했습니다.");
      } catch (_) {
        notify("점검 정보 복사 실패: 아래 수치를 직접 복사해주세요.");
      }
    };
    $(".ic-clear").onclick = () => {
      model.clear();
      render();
    };
    chrome.storage.local.get([CZImportantChat.KEY, HEIGHT_KEY]).then((value) => {
      if (scope.isDisposed) return;
      const height = Number(value[HEIGHT_KEY]);
      if (Number.isFinite(height) && height >= 64 && height <= 1600) desiredHeight = height;
      resize();
      filter = CZImportantChat.settings(value[CZImportantChat.KEY]);
      ready = true;
      controls();
      configure();
      render();
    }).catch((error) => {
      if (scope.isDisposed) return;
      ready = true;
      controls();
      configure();
      render();
      notify("채팅 설정 불러오기 실패: " + error.message);
    });
    const onStorageChanged = (changes, area) => {
      if (scope.isDisposed) return;
      if (area !== "local") return;
      if (changes[HEIGHT_KEY]) {
        const height = Number(changes[HEIGHT_KEY].newValue);
        if (Number.isFinite(height) && height >= 64 && height <= 1600) {
          desiredHeight = height;
          resize();
        }
      }
      if (!changes[CZImportantChat.KEY]) return;
      const next = CZImportantChat.settings(changes[CZImportantChat.KEY].newValue);
      if (JSON.stringify(next) === JSON.stringify(filter)) return;
      filter = next;
      model.applySettings(filter);
      controls();
      configure();
      render();
    };
    chrome.storage.onChanged.addListener(onStorageChanged);
    scope.add(() => chrome.storage.onChanged.removeListener?.(onStorageChanged));
    function dispose() {
      if (scope.isDisposed) return;
      scope.dispose();
      chatPanel.classList.remove("ic-resizing");
      drag = null;
      enabledControl.onchange = null;
      if (dialog.open) dialog.close();
      model.clear();
      renderer.clear();
      owners.clear();
      panel.remove();
      dialog.remove();
    }
    controls();
    render();
    return { dispose, openSettings, sync(force = false) {
      if (getState().chatOpen === false && dialog.open) dialog.close();
      if (force && getFrame()) {
        configured.delete(getFrame());
        presented.delete(getFrame());
      }
      const uid = getState().chatOpen !== false ? getState().selectedUid : null;
      if (model.uid !== uid) {
        model.reset(uid);
        stats = null;
        received = 0;
      }
      configure();
      render();
    }, status(value) {
      stats = value && typeof value === "object" ? value : null;
      diagnostics();
    }, receive(data) {
      if (Array.isArray(data.messages)) received += Math.min(100, data.messages.length);
      if (ready && model.add(data.uid, data.messages, filter)) render();
      else diagnostics();
    }, panel };
  } };

  // src/viewer/layout.ts
  function create2(context) {
    const { tileMap, scope, createTile, sendTileVolume, applyTileLock, refreshChannelManager, refreshVolumeManager } = context;
    let pendingFrame = null;
    function updateLayoutToggle() {
      const { ui, state } = context;
      if (!ui) return;
      ui.querySelectorAll(".layout-toggle-btn").forEach((button) => {
        const active = button.dataset.layout === state.layout;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }
    function applyLayout({ audio: audio2 = true } = {}) {
      const { videoGrid, state } = context;
      if (!videoGrid) return;
      videoGrid.classList.remove("layout-grid", "layout-2x2", "layout-3x3", "layout-main-sub");
      if (String(state.layout) === "2x2" || String(state.layout) === "3x3") state.layout = "grid";
      if (!["grid", "main-sub"].includes(state.layout)) state.layout = "grid";
      videoGrid.classList.add(`layout-${state.layout}`);
      const displayMax = state.layout === "main-sub" ? 4 : 9;
      const visibleChannels = state.channels.slice(0, displayMax);
      const visibleUids = new Set(visibleChannels.map((c) => c.uid));
      if (visibleChannels.length && !visibleUids.has(state.selectedUid || "")) {
        state.selectedUid = visibleChannels[0].uid;
      }
      for (const [uid, tile] of Array.from(tileMap.entries())) {
        if (visibleUids.has(uid)) continue;
        const iframe = tile.querySelector("iframe");
        if (iframe) iframe.src = "about:blank";
        const hiddenChannel = state.channels.find((c) => c.uid === uid);
        if (hiddenChannel) hiddenChannel.muted = true;
        context.onRemove?.(uid);
        tile.remove();
        tileMap.delete(uid);
      }
      for (const channel of visibleChannels) {
        createTile(channel);
      }
      visibleChannels.forEach((channel, index) => {
        const tile = tileMap.get(channel.uid);
        if (!tile) return;
        tile.style.display = "flex";
        tile.style.order = String(index);
        tile.style.gridColumn = "";
        tile.style.gridRow = "";
        tile.classList.toggle("main-tile", state.layout === "main-sub" && index === 0);
        tile.classList.remove("extra-main-sub");
        if (state.layout === "main-sub") {
          const mainOnLeft = state.chatSide === "left";
          if (index === 0) {
            tile.style.gridColumn = mainOnLeft ? "1" : "2";
            tile.style.gridRow = "1 / 4";
          } else {
            tile.style.gridColumn = mainOnLeft ? "2" : "1";
            tile.style.gridRow = String(index);
          }
        }
        if (audio2) sendTileVolume(channel.uid);
        applyTileLock(tile, state.screenLocked === true);
      });
      if (state.layout === "main-sub") {
        videoGrid.style.setProperty("--sub-count", String(Math.min(3, Math.max(1, visibleChannels.length - 1))));
      } else {
        videoGrid.style.removeProperty("--sub-count");
      }
      updateLayoutToggle();
      resizeFixedAspectGrid();
      refreshChannelManager();
      refreshVolumeManager();
    }
    function resizeFixedAspectGrid() {
      const { videoGrid } = context;
      if (!videoGrid) return;
      if (pendingFrame || scope.isDisposed) return;
      pendingFrame = scope.frame(() => {
        pendingFrame = null;
        const { state } = context;
        const layout = state.layout;
        if (!["grid", "main-sub"].includes(layout)) return;
        const rect = videoGrid.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const gap = 8;
        if (layout === "main-sub") {
          const subH = Math.max(1, (rect.height - gap * 2) / 3);
          const subW = subH * 16 / 9;
          const mainW = Math.max(1, rect.width - gap - subW);
          if (state.chatSide === "left") {
            videoGrid.style.gridTemplateColumns = `${mainW}px ${subW}px`;
          } else {
            videoGrid.style.gridTemplateColumns = `${subW}px ${mainW}px`;
          }
          videoGrid.style.gridTemplateRows = `repeat(3, ${subH}px)`;
          videoGrid.style.justifyContent = "center";
          videoGrid.style.alignContent = "center";
          videoGrid.style.overflow = "hidden";
          return;
        }
        const count = Math.min(state.channels.length, 9);
        let cols = 1;
        let rows = 1;
        if (count >= 7) {
          cols = 3;
          rows = 3;
        } else if (count >= 5) {
          cols = 3;
          rows = 2;
        } else if (count >= 3) {
          cols = 2;
          rows = 2;
        } else if (count === 2) {
          cols = 2;
          rows = 1;
        }
        const cellW = Math.max(1, (rect.width - gap * (cols - 1)) / cols);
        const cellH = Math.max(1, (rect.height - gap * (rows - 1)) / rows);
        const tileW = Math.min(cellW, cellH * 16 / 9);
        const tileH = tileW * 9 / 16;
        videoGrid.style.gridTemplateColumns = `repeat(${cols}, ${tileW}px)`;
        videoGrid.style.gridTemplateRows = `repeat(${rows}, ${tileH}px)`;
        videoGrid.style.justifyContent = "center";
        videoGrid.style.alignContent = "center";
        videoGrid.style.overflow = "hidden";
      });
    }
    return { updateLayoutToggle, applyLayout, resizeFixedAspectGrid };
  }

  // src/viewer/template.ts
  var html = `
      <header class="mv-toolbar">
        <div class="toolbar-left">
          <details id="followingManager" class="favorite-manager"><summary>팔로잉</summary><div class="favorite-manager-panel"><div id="followingList"></div></div></details>
          <details id="favoriteManager" class="favorite-manager">
            <summary>즐겨찾기</summary>
            <div class="favorite-manager-panel">
              <div class="favorite-manager-tools">
                <button id="favoriteManageGroups" type="button">그룹 관리</button>
                <button id="favoriteRefresh" type="button" title="온라인 상태 새로고침">↻</button>
              </div>
              <div id="favoriteList" class="favorite-list"></div>
            </div>
          </details>
          <div class="add-area">
            <input id="uidInput" placeholder="방송 URL 또는 UID">
            <button id="addBtn" class="accent">방송 추가</button>
          </div>
          <details id="channelManager" class="channel-manager">
            <summary>방송 목록</summary>
            <div class="channel-manager-panel">
              <div class="channel-manager-head"><strong>현재 방송</strong><button id="clearBtn" class="manager-clear">전체 삭제</button></div>
              <div id="channelList" class="channel-list"></div>
            </div>
          </details>
        </div>

        <div class="toolbar-center" aria-hidden="true"></div>

        <div class="toolbar-right">
          <details id="syncManager" class="volume-manager sync-manager">
            <summary>싱크<span id="syncBadge" class="sync-badge" hidden></span></summary>
            <div class="volume-manager-panel sync-panel">
              <div class="sync-summary">
                <div class="sync-summary-head">
                  <strong>싱크 조정 현황</strong>
                  <button id="syncLatestAll" type="button" class="manager-clear">전체 최신으로</button>
                  <button id="syncResetAll" type="button" class="manager-clear" disabled>전체 초기화</button>
                </div>
                <div id="syncSummaryList" class="sync-summary-list"></div>
              </div>
              <p class="volume-help">- 버튼은 방송을 뒤로 당기고(되감기, 지연 증가), + 버튼은 앞으로 밀어 라이브에 더 가깝게 합니다. 조정값은 저장되지 않으며 방송이 다시 로드되면 0으로 돌아갑니다.</p>
              <div id="syncList" class="sync-list"></div>
            </div>
          </details>
          <details id="volumeManager" class="volume-manager">
            <summary>볼륨</summary>
            <div class="volume-manager-panel">
              <div class="volume-row volume-master-row">
                <div class="master-volume-top">
                  <label for="masterVolume">전체 볼륨 <output id="masterVolumeValue">100%</output></label>
                </div>
                <div class="volume-slider-line"><button type="button" id="masterMuteBtn" class="tile-mute-btn" title="전체 음소거"></button><input id="masterVolume" type="range" min="0" max="100" value="100" step="1"></div>
                <p class="volume-help">확장프로그램 전체 음량입니다. 아래 방송별 볼륨에 곱해져 적용되며, 방송별 설정값은 바뀌지 않습니다.</p>
              </div>
              <label class="main-only-check" for="mainOnlyCheck">
                <input id="mainOnlyCheck" type="checkbox">
                <span class="main-only-text">
                  <strong>메인만 듣기</strong>
                  <small>체크하면 메인 방송의 소리만 재생하고 나머지 방송은 음소거합니다. 해제하면 각 방송이 기존 설정대로 돌아옵니다.</small>
                </span>
              </label>
              <div id="tileVolumeList" class="tile-volume-list"></div>
            </div>
          </details>
          <div id="layoutToggle" class="layout-toggle" role="group" aria-label="레이아웃">
            <button type="button" class="layout-toggle-btn" data-layout="grid">그리드</button>
            <button type="button" class="layout-toggle-btn" data-layout="main-sub">레이드</button>
          </div>
          <button id="chatSideBtn" class="icon-btn" type="button"></button>
          <button id="chatToggleBtn" title="채팅 닫기/열기 (C)">채팅 닫기</button>
          <details id="settingsManager" class="viewer-settings">
            <summary title="설정">⚙ 설정</summary>
            <div class="settings-panel"><strong>설정</strong>
              <div class="settings-feature"><button id="settingsBackupBtn" type="button">설정 내보내기 / 불러오기</button><p>즐겨찾기와 멀티뷰 설정을 JSON 파일로 보관하거나 복원합니다.</p></div>
              <div class="settings-feature">
                <label class="settings-option"><span>멀티뷰 단축키 사용</span><span class="settings-switch"><input id="shortcutsEnabled" type="checkbox" role="switch" aria-label="멀티뷰 단축키 사용" aria-describedby="shortcutsDescription"><span class="settings-switch-track" aria-hidden="true"></span></span></label>
                <p id="shortcutsDescription">즐겨찾기·화면 잠금·상단바·소리·배치·채팅 및 방향키 단축키를 켜거나 끕니다. 스크린샷 S와 녹화 R은 항상 사용할 수 있습니다.</p>
              </div>
              <div class="settings-feature">
                <div class="settings-option"><label for="importantChatEnabled">채팅 모아보기 사용</label><div class="settings-option-actions"><button id="importantChatSettings" class="settings-gear" type="button" title="수집 설정·점검" aria-label="수집 설정·점검"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m9 3-.5 2-2 1-2-.5-2 3 1.5 1.5v3L2.5 15l2 3 2-.5 2 1 .5 2h4l.5-2 2-1 2 .5 2-3-1.5-1.5v-3L20 9l-2-3-2 .5-2-1-.5-2Z"/><circle cx="11.5" cy="12" r="3"/></svg></button><label class="settings-switch"><input id="importantChatEnabled" type="checkbox" role="switch" aria-label="채팅 모아보기 사용" aria-describedby="importantChatDescription"><span class="settings-switch-track" aria-hidden="true"></span></label></div></div>
                <p id="importantChatDescription">주요 사용자의 채팅을 별도 영역에 모아 표시합니다.</p>
              </div>
              <div class="settings-feature">
                <label class="settings-option" for="recordingProfile"><span>녹화 품질</span><select id="recordingProfile"><option value="balanced">저부하 · 최대 720p / 30fps</option><option value="original">원본 해상도 / 프레임</option></select></label>
                <p>저부하 모드는 녹화 인코딩 부담을 줄입니다. 설정은 다음 녹화부터 적용됩니다.</p>
              </div>
              <div class="settings-feature">
                <label class="settings-option"><span>통나무 수집 보조 <span class="settings-experimental">(실험)</span></span><span class="settings-switch"><input id="powerRewardsEnabled" type="checkbox" role="switch" aria-label="통나무 수집 보조" aria-describedby="powerRewardsDescription"><span class="settings-switch-track" aria-hidden="true"></span></span></label>
                <p id="powerRewardsDescription">각 라이브 타일의 원본 채팅 구성요소를 유지하고 명확한 보너스 받기 버튼을 자동 클릭합니다. 메모리 사용이 늘 수 있으며 실제 적립·수령은 치지직 조건에 따릅니다. 기본 OFF입니다.</p>
              </div>
              <div class="settings-feature">
                <label class="settings-option"><span>채팅 타임스탬프 <span class="settings-experimental">(실험)</span></span><span class="settings-switch"><input id="chatTimestampsEnabled" type="checkbox" role="switch" aria-label="채팅 타임스탬프" aria-describedby="chatTimestampsDescription"><span class="settings-switch-track" aria-hidden="true"></span></span></label>
                <p id="chatTimestampsDescription">기본 OFF입니다. 켜면 확인 가능한 원본 작성 시각만 표시합니다. OFF 시 시각 읽기와 표시를 중단하며 채팅 모아보기 기록은 유지합니다.</p>
              </div>
              <div class="settings-debug-panel"><button id="powerDiagnosticsBtn" type="button">통나무 파워 점검</button></div>
            </div>
          </details>
        </div>
      </header>

      <div id="centerControls" class="center-controls">
        <button id="screenLockBtn" class="center-btn" type="button" title="플레이어 조작 잠금">화면 잠금</button>
        <button id="collapseBtn" class="center-btn center-collapse" type="button" title="멀티뷰 메뉴 접기" aria-label="멀티뷰 메뉴 접기"></button>
      </div>

      <section class="mv-body">
        <div id="videoGrid" class="video-grid"></div>

        <aside id="chatPanel" class="chat-panel">
          <div class="chat-frame-wrap">
            <div id="chatEmpty" class="chat-empty">
              메인 방송을 선택하면<br>실제 CHZZK 채팅을 불러옵니다.
            </div>
          </div>
        </aside>
      </section>
`;

  // src/viewer/controllers/view.js
  function mount({ rootId: ROOT_ID, siteMode }) {
    if (document.getElementById(ROOT_ID)) {
      const existing = document.getElementById(ROOT_ID);
      existing.style.display = "block";
      return null;
    }
    const host = document.createElement("div");
    host.id = ROOT_ID;
    document.body.appendChild(host);
    if (siteMode) {
      host.style.cssText = "position:fixed;inset:0;z-index:2147483647";
      document.querySelectorAll("video").forEach((video) => {
        video.muted = true;
        video.pause();
      });
    }
    const shadowRoot = host.attachShadow({ mode: "open" });
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = chrome.runtime.getURL("src/viewer/viewer.css");
    shadowRoot.appendChild(style);
    const groupStyle = document.createElement("link");
    groupStyle.rel = "stylesheet";
    groupStyle.href = chrome.runtime.getURL("src/shared/group-manager.css");
    shadowRoot.appendChild(groupStyle);
    const ui = document.createElement("div");
    ui.className = "mv-root";
    ui.innerHTML = html;
    shadowRoot.appendChild(ui);
    if (siteMode) {
      const exit = document.createElement("button");
      exit.textContent = "치지직으로 돌아가기";
      exit.id = "siteReturnBtn";
      exit.className = "center-btn";
      exit.type = "button";
      exit.onclick = () => location.reload();
      ui.querySelector("#centerControls").appendChild(exit);
      ui.querySelector("#centerControls").classList.add("has-site-return");
    }
    return { ui, videoGrid: ui.querySelector("#videoGrid"), chatPanel: ui.querySelector("#chatPanel") };
  }

  // src/viewer/settings.ts
  function bind(context) {
    const { root, scope } = context;
    function element(selector) {
      const el = root.querySelector(selector);
      if (!el) throw Error(`Missing settings control: ${selector}`);
      return el;
    }
    const settings = element("#settingsManager");
    const shortcut = element("#shortcutsEnabled");
    shortcut.checked = context.state.shortcutsEnabled !== false;
    scope.listen(shortcut, "change", () => {
      context.state.shortcutsEnabled = shortcut.checked;
      context.syncShortcuts();
      context.save();
    });
    scope.listen(element("#importantChatSettings"), "click", () => {
      settings.open = false;
      context.openChatSettings();
    });
    scope.listen(element("#powerDiagnosticsBtn"), "click", () => {
      settings.open = false;
      context.openPowerDiagnostics();
    });
    scope.listen(element("#settingsBackupBtn"), "click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_BACKUP" }).catch(console.error);
    });
    const power = element("#powerRewardsEnabled");
    power.checked = context.state.powerRewards === true;
    scope.listen(power, "change", () => {
      context.state.powerRewards = power.checked;
      context.syncShortcuts();
      context.save();
    });
    const timestamps = element("#chatTimestampsEnabled");
    timestamps.checked = context.state.chatTimestamps === true;
    root.dataset.chatTimestamps = String(timestamps.checked);
    scope.listen(timestamps, "change", () => {
      context.state.chatTimestamps = timestamps.checked;
      context.syncShortcuts();
      context.save();
    });
    const others = ["favoriteManager", "followingManager", "syncManager", "volumeManager", "channelManager"].map((id) => element("#" + id));
    scope.listen(settings, "toggle", () => {
      if (settings.open) for (const panel of others) panel.open = false;
    });
    for (const panel of others) scope.listen(panel, "toggle", () => {
      if (panel.open) settings.open = false;
    });
  }

  // src/viewer/controllers/controls.js
  function bind2(context) {
    const {
      ui,
      mediaTools: mediaTools2,
      addFromInput,
      clearAll,
      favoriteController,
      toggleToolbar,
      toggleChat,
      toggleChatSide,
      toggleScreenLock,
      scope,
      saveState,
      syncShortcutSettings,
      importantChat,
      powerDiagnostics: powerDiagnostics2,
      volumePanel,
      renderSyncUI,
      resetAllSync,
      adjustSync,
      resetSync,
      moveSelectedToFront,
      applyLayout,
      updateLayoutToggle,
      refreshFavoriteList,
      refreshChannelManager,
      setChatOpen,
      setChatSide,
      setScreenLock,
      updateToolbarToggleUI,
      syncVolumeUI
    } = context;
    ui.querySelector("#addBtn").addEventListener("click", addFromInput);
    ui.querySelector("#clearBtn").addEventListener("click", clearAll);
    favoriteController.bind();
    ui.querySelector("#collapseBtn").addEventListener("click", toggleToolbar);
    ui.querySelector("#chatToggleBtn").addEventListener("click", toggleChat);
    ui.querySelector("#chatSideBtn").addEventListener("click", toggleChatSide);
    ui.querySelector("#screenLockBtn").addEventListener("click", toggleScreenLock);
    bind({
      root: ui,
      get state() {
        return context.state;
      },
      scope,
      save: saveState,
      syncShortcuts: syncShortcutSettings,
      openChatSettings: () => importantChat.openSettings(),
      openPowerDiagnostics: () => powerDiagnostics2.open()
    });
    volumePanel.bind();
    ui.querySelector("#syncManager").addEventListener("toggle", (e) => {
      if (!e.target.open) return;
      ui.querySelector("#volumeManager")?.removeAttribute("open");
      renderSyncUI();
    });
    ui.querySelector("#volumeManager").addEventListener("toggle", (e) => {
      if (e.target.open) ui.querySelector("#syncManager")?.removeAttribute("open");
    });
    ui.querySelector("#syncLatestAll").addEventListener("click", () => context.state.channels.forEach((channel) => adjustSync(channel.uid, "latest")));
    ui.querySelector("#syncResetAll").addEventListener("click", resetAllSync);
    ui.querySelector("#syncList").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      const uid = btn?.closest(".sync-row")?.dataset.uid;
      if (!btn || !uid || btn.disabled) return;
      if (btn.dataset.latest !== void 0) adjustSync(uid, "latest");
      else if (btn.dataset.step) adjustSync(uid, Number(btn.dataset.step));
      else if (btn.dataset.reset !== void 0) resetSync(uid);
    });
    ui.querySelector("#uidInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") addFromInput();
    });
    ui.querySelectorAll(".layout-toggle-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const state2 = context.state;
        const nextLayout = button.dataset.layout;
        if (!["grid", "main-sub"].includes(nextLayout)) return;
        if (state2.layout === nextLayout) return;
        const proposed = nextLayout === "main-sub" ? [...state2.channels.filter((channel) => channel.uid === state2.selectedUid), ...state2.channels.filter((channel) => channel.uid !== state2.selectedUid)] : state2.channels;
        if (!mediaTools2.canDisplay(proposed, nextLayout)) return;
        state2.layout = nextLayout;
        if (nextLayout === "main-sub") moveSelectedToFront();
        applyLayout();
        saveState();
      });
    });
    const state = context.state;
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

  // src/viewer/controllers/messages.js
  function bind3(context) {
    const { scope, tileMap, powerDiagnostics: powerDiagnostics2, clearSyncState, sendTileVolume, mediaTools: mediaTools2, receiveVideoState, handleSyncState, handleSyncResult } = context;
    scope.listen(window, "message", (event) => {
      const { chatFrame, importantChat, state } = context;
      const data = event.data;
      const fromChat = ["CHAT_READY", "IMPORTANT_CHAT_BATCH", "IMPORTANT_CHAT_STATUS", "CHAT_SETTINGS_OPEN", "CHAT_HEADER"].includes(data?.type) || data?.type === "MEDIA_KEY" && event.source === chatFrame?.contentWindow;
      const frame = fromChat ? chatFrame : tileMap.get(data?.uid)?.querySelector("iframe");
      if (!CZMessages.isPlayerMessage(event, frame) || fromChat && data.uid !== chatFrame?.dataset.uid) return;
      if (data.type === "POWER_DIAGNOSTICS_RESULT") {
        powerDiagnostics2.receive(data);
        return;
      }
      if (data.type === "CHAT_SETTINGS_OPEN") {
        importantChat?.openSettings();
        return;
      }
      if (data.type === "CHAT_HEADER") return;
      if (data.type === "IMPORTANT_CHAT_STATUS") {
        importantChat?.status(data.stats);
        return;
      }
      if (data.type === "IMPORTANT_CHAT_BATCH") {
        importantChat?.receive(data);
        return;
      }
      if (data.type === "CHAT_READY") {
        if (data.uid !== chatFrame?.dataset.uid) return;
        frame.dataset.playerReady = "true";
        CZMessages.postToPlayer(frame, { source: "chzzk-multiview", type: "CHAT_TIMESTAMP_CONFIG", enabled: state.chatTimestamps === true });
        importantChat?.sync(true);
        CZMessages.postToPlayer(frame, { source: "chzzk-multiview", type: "MEDIA_SHORTCUTS", enabled: state.shortcutsEnabled !== false });
        CZMessages.postToPlayer(frame, { source: "chzzk-multiview", type: "SET_CHAT_MODE", visible: true });
      } else if (data.type === "PLAYER_READY") {
        frame.dataset.playerReady = "true";
        CZMessages.postToPlayer(frame, { source: "chzzk-multiview", type: "MEDIA_SHORTCUTS", enabled: state.shortcutsEnabled !== false });
        CZMessages.postToPlayer(frame, { source: "chzzk-multiview", type: "POWER_REWARDS_CONFIG", enabled: state.powerRewards === true });
        clearSyncState(data.uid);
        sendTileVolume(data.uid);
        CZMessages.postToPlayer(frame, { source: "chzzk-multiview", type: "ENTER_THEATER" });
        CZMessages.postToPlayer(frame, { source: "chzzk-multiview", type: "SET_CHAT_VISIBLE", visible: false });
      } else if (data.type.startsWith("MEDIA_")) mediaTools2.receive(data);
      else if (data.type === "VIDEO_STATE") receiveVideoState(data);
      else if (data.type === "SYNC_STATE") handleSyncState(data);
      else if (data.type === "SYNC_RESULT") handleSyncResult(data);
    });
  }

  // src/viewer/controllers/shell.js
  function create3(context) {
    const { scope, tileMap, saveState, applyLayout, updateChat, resizeFixedAspectGrid } = context;
    let toolbarCollapsed = false;
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
      const { state, ui } = context;
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
      const state = context.state;
      setScreenLock(!state.screenLocked);
    }
    function toggleToolbar() {
      const ui = context.ui;
      if (!ui) return;
      toolbarCollapsed = !toolbarCollapsed;
      ui.classList.toggle("toolbar-collapsed", toolbarCollapsed);
      updateToolbarToggleUI();
      resizeFixedAspectGrid();
    }
    function updateToolbarToggleUI() {
      const ui = context.ui;
      if (!ui) return;
      const btn = ui.querySelector("#collapseBtn");
      if (!btn) return;
      btn.innerHTML = toolbarCollapsed ? ICON_CHEVRON_DOWN : ICON_CHEVRON_UP;
      btn.title = toolbarCollapsed ? "멀티뷰 메뉴 펼치기" : "멀티뷰 메뉴 접기";
      btn.setAttribute("aria-label", btn.title);
    }
    function setChatSide(side, persist = true) {
      const { state, ui } = context;
      state.chatSide = side === "left" ? "left" : "right";
      if (!ui) return;
      ui.classList.toggle("chat-left", state.chatSide === "left");
      const btn = ui.querySelector("#chatSideBtn");
      if (btn) {
        btn.innerHTML = chatSideIcon(state.chatSide);
        btn.title = state.chatSide === "left" ? "채팅창을 오른쪽으로 이동" : "채팅창을 왼쪽으로 이동";
        btn.setAttribute("aria-label", btn.title);
      }
      applyLayout();
      if (persist) saveState();
    }
    function toggleChatSide() {
      const state = context.state;
      setChatSide(state.chatSide === "left" ? "right" : "left");
    }
    function setChatOpen(open) {
      const { state, ui } = context;
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
      const state = context.state;
      setChatOpen(state.chatOpen === false);
    }
    function showNotice(message) {
      const ui = context.ui;
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
    return {
      get collapsed() {
        return toolbarCollapsed;
      },
      applyTileLock,
      setScreenLock,
      toggleScreenLock,
      toggleToolbar,
      updateToolbarToggleUI,
      setChatSide,
      toggleChatSide,
      setChatOpen,
      toggleChat,
      showNotice
    };
  }

  // src/viewer/models/channel-input.ts
  function requestedChannels(inputs, current, favorites) {
    const result = [];
    for (const input of inputs) {
      const parsed = CZSessionStore.parseInput(input), uid = parsed?.uid;
      if (!parsed || !uid || result.some((channel) => channel.uid === uid)) continue;
      const previous = current.find((channel) => channel.uid === uid), favorite = favorites.find((channel) => channel.uid === uid);
      const favoriteName = favorite?.name || favorite?.title || "", fallback = `CHZZK ${uid}`;
      result.push({
        uid,
        type: parsed.type,
        sourceId: parsed.id,
        url: parsed.url,
        title: previous?.title || favoriteName || fallback,
        linkTitle: previous?.linkTitle || favoriteName || fallback,
        name: previous?.name || favoriteName || "",
        muted: previous?.muted ?? true,
        volume: previous?.volume ?? 1
      });
    }
    return result;
  }

  // src/viewer/controllers/channels.js
  function create4(context) {
    const {
      tileMap,
      session,
      showNotice,
      saveState,
      applyLayout,
      updateChat,
      refreshChannelManager,
      syncSelection,
      updateLayoutToggle,
      isChannelVisibleInLayout,
      createTile,
      selectChannel,
      clearSyncState,
      clearAllSyncState,
      makeMainAudible,
      moveSelectedToFront,
      syncVolumeUI,
      createUI,
      refreshFavoriteList,
      refreshFavoriteOnlineStatus,
      applyFavoriteSnapshot
    } = context;
    const parseInput = CZSessionStore.parseInput, fetchChannelName = CZFavoritesStore.fetchChannelName;
    const safeTitle = (uid) => `CHZZK ${uid}`;
    const uidFromInput = (value) => parseInput(value)?.uid || null;
    const mediaTools2 = context.mediaTools;
    async function loadState() {
      await context.favorites.load();
      if (!session.ready) context.state = await CZSessionStore.read();
    }
    function addFromInput() {
      const ui = context.ui;
      const input = ui.querySelector("#uidInput");
      const parsed = parseInput(input.value);
      if (!parsed) {
        input.focus();
        input.classList.add("invalid");
        context.scope.timeout(() => input.classList.remove("invalid"), 500);
        return;
      }
      addChannel(parsed.uid, parsed);
      input.value = "";
      input.focus();
    }
    function addChannel(uid, parsed = { type: "live", id: uid, uid, url: `https://chzzk.naver.com/live/${encodeURIComponent(uid)}` }) {
      const state = context.state;
      if (state.channels.some((c) => c.uid === uid)) {
        selectChannel(uid);
        return;
      }
      const favorites = context.favorites.items;
      const favorite = parsed.type === "live" ? favorites.find((f) => f.uid === parsed.id) : null;
      const favoriteName = favorite?.name || favorite?.title || "";
      const channel = {
        uid,
        type: parsed.type,
        sourceId: parsed.id,
        url: parsed.url,
        title: favoriteName || (parsed.type === "video" ? `다시보기 ${parsed.id}` : safeTitle(parsed.id)),
        linkTitle: favoriteName || (parsed.type === "video" ? `다시보기 ${parsed.id}` : safeTitle(parsed.id)),
        name: favoriteName,
        muted: true,
        volume: 1
      };
      state.channels.push(channel);
      updateLayoutToggle();
      if (!state.selectedUid) {
        state.selectedUid = uid;
      }
      if (isChannelVisibleInLayout(channel.uid)) createTile(channel);
      refreshChannelManager();
      syncSelection();
      applyLayout();
      updateChat();
      saveState();
      resolveChannelName(channel);
    }
    function resolveChannelName(channel) {
      const uid = channel.uid;
      (channel.type === "video" ? CZChzzkApi.fetchVideoChannelName(channel.sourceId) : fetchChannelName(channel.sourceId || uid)).then(async (name) => {
        if (!name || context.scope.isDisposed) return;
        const state = context.state;
        const current = state.channels.find((c) => c.uid === uid);
        if (!current) return;
        current.name = name;
        current.title = name;
        const fav = context.favorites.items.find((f) => f.uid === uid);
        if (fav && (fav.name !== name || fav.title !== name)) {
          fav.name = name;
          fav.title = name;
          try {
            applyFavoriteSnapshot(await CZFavoritesStore.writeInfo({ [uid]: { name, title: name } }));
          } catch (error) {
            console.warn("방송 이름 저장 실패:", error);
          }
          refreshFavoriteList();
          refreshChannelManager();
        }
        if (context.scope.isDisposed) return;
        updateChat();
        const nameEl = tileMap.get(uid)?.querySelector(".tile-streamer-name");
        if (nameEl) nameEl.textContent = name;
        refreshChannelManager();
        syncVolumeUI();
        saveState();
      }).catch((error) => console.warn("방송 이름 조회 실패:", error));
    }
    function removeChannel(uid) {
      const state = context.state;
      if (mediaTools2.isRecording(uid)) {
        showNotice("녹화를 중지하고 결과를 확인한 뒤 방송을 삭제하세요.");
        return;
      }
      if (!state.channels.some((channel) => channel.uid === uid)) return;
      const selectedChanged = state.selectedUid === uid;
      const tile = tileMap.get(uid);
      tileMap.delete(uid);
      state.channels = state.channels.filter((c) => c.uid !== uid);
      const iframe = tile?.querySelector("iframe");
      if (iframe) iframe.dataset.playerReady = "false";
      mediaTools2.detach(uid);
      clearSyncState(uid);
      tile?.remove();
      if (selectedChanged) {
        state.selectedUid = state.channels[0]?.uid || null;
        if (state.selectedUid && state.mainOnly) makeMainAudible();
      }
      applyLayout({ audio: false });
      if (selectedChanged) {
        syncSelection({ audio: state.mainOnly, chrome: false });
        updateChat();
      }
      saveState();
    }
    function clearAll() {
      const state = context.state;
      if (mediaTools2.hasRecordings()) {
        showNotice("녹화를 중지한 뒤 전체 삭제하세요.");
        return;
      }
      for (const [uid, tile] of tileMap) {
        const iframe = tile.querySelector("iframe");
        if (iframe) iframe.src = "about:blank";
        mediaTools2.detach(uid);
        tile.remove();
      }
      tileMap.clear();
      clearAllSyncState();
      state.channels = [];
      state.selectedUid = null;
      refreshChannelManager();
      updateChat();
      applyLayout();
      saveState();
    }
    async function openMultiView(initialInput = "", initialInputs = []) {
      if (mediaTools2.hasRecordings() && initialInputs.length) throw Error("녹화를 중지한 뒤 방송 목록을 교체하세요.");
      await loadState();
      if (context.scope.isDisposed) return;
      const state = context.state, favorites = context.favorites.items;
      const hasPopupList = Array.isArray(initialInputs) && initialInputs.length > 0;
      const popupInputs = hasPopupList ? initialInputs : initialInput ? [initialInput] : [];
      if (hasPopupList) {
        state.channels = requestedChannels(popupInputs, state.channels, favorites);
      } else if (initialInput) {
        const uid = uidFromInput(initialInput);
        if (uid && !state.channels.some((c) => c.uid === uid)) {
          state.channels.push({ uid, title: safeTitle(uid), linkTitle: safeTitle(uid), name: "", muted: true, volume: 1 });
        }
      }
      if (!session.ready) state.channels.forEach((channel) => {
        channel.volume = 0.1;
        channel.muted = true;
      });
      if (!state.channels.some((c) => c.uid === state.selectedUid)) state.selectedUid = state.channels[0]?.uid || null;
      if (state.layout === "main-sub") moveSelectedToFront();
      for (const [uid, tile] of tileMap) {
        if (state.channels.some((c) => c.uid === uid)) continue;
        mediaTools2.detach(uid);
        tile.remove();
        tileMap.delete(uid);
        clearSyncState(uid);
      }
      saveState();
      createUI();
      refreshFavoriteList();
      refreshFavoriteOnlineStatus(false).catch(console.warn);
      state.channels.forEach(resolveChannelName);
      syncSelection();
      applyLayout();
      updateChat();
    }
    function addFavorite(favorite) {
      if (favorite && !context.state.channels.some((channel) => channel.uid === favorite.uid)) addChannel(favorite.uid, { type: "live", id: favorite.uid, uid: favorite.uid, url: `https://chzzk.naver.com/live/${encodeURIComponent(favorite.uid)}` });
    }
    return { addFromInput, addChannel, removeChannel, clearAll, resolveChannelName, open: openMultiView, addFavorite };
  }

  // src/viewer/controllers/session.ts
  function create5(context) {
    let tabId = null, ready = false, cancelSave = null;
    function save() {
      if (context.scope.isDisposed) return;
      cancelSave?.();
      cancelSave = null;
      try {
        if (!chrome?.runtime?.id || !chrome?.storage?.local) return;
        chrome.runtime.sendMessage({ type: "VIEWER_SAVE_STATE", tabId, state: CZSessionStore.normalize(context.state) }).then((result) => {
          if (!result?.ok) throw Error(result?.error || "상태 저장 응답 없음");
        }).catch((error) => console.warn("멀티뷰 상태 저장 실패:", error));
      } catch (error) {
        if (!String(error instanceof Error ? error.message : error).includes("Extension context invalidated")) console.warn("멀티뷰 상태 저장 실패:", error);
      }
    }
    function saveSoon() {
      if (context.scope.isDisposed) return;
      cancelSave?.();
      cancelSave = context.scope.timeout(save, 300);
    }
    async function register(siteMode) {
      tabId = siteMode ? (await chrome.runtime.sendMessage({ type: "SITE_VIEWER_TAB" }))?.tabId : (await chrome.tabs.getCurrent())?.id ?? null;
      const result = await chrome.runtime.sendMessage({ type: "VIEWER_REGISTER_SESSION", tabId });
      if (!result?.ok) throw Error(result?.error || "멀티뷰 저장 세션 등록 실패");
    }
    function receive(value, sender, reply) {
      if (!value || typeof value !== "object") return;
      const message = value;
      if (sender.id !== chrome.runtime.id || message.tabId !== tabId) return;
      if (message.type === "VIEWER_GET_STATE") {
        reply(ready ? { ok: true, state: CZSessionStore.normalize(context.state) } : { ok: false });
        return;
      }
      if (message.type !== "VIEWER_SET_INPUTS") return;
      if (!ready) {
        reply({ ok: false });
        return;
      }
      context.open(Array.isArray(message.initialInputs) ? message.initialInputs : []).then(() => reply({ ok: true })).catch((error) => reply({ ok: false, error: String(error) }));
      return true;
    }
    chrome.runtime.onMessage.addListener(receive);
    context.scope.add(() => chrome.runtime.onMessage.removeListener?.(receive));
    return { get tabId() {
      return tabId;
    }, get ready() {
      return ready;
    }, markReady() {
      ready = true;
    }, register, save, saveSoon };
  }

  // src/shared/favorite-item.js
  var escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  function favoriteDetails(favorite) {
    const name = escape(favorite.name || favorite.title || favorite.uid);
    if (!favorite.online) return `<span class="favorite-details favorite-offline"><span class="favorite-primary"><span class="favorite-name favorite-list-name" title="${name}">${name}</span><span class="favorite-offline-label">오프라인</span></span></span>`;
    const title = escape(favorite.online ? favorite.liveTitle || "방송 제목 확인 중" : "방송 종료");
    const category = escape(favorite.online ? favorite.category || "카테고리 없음" : "오프라인");
    const duration = escape(CZFavoritesStore.favoriteDuration(favorite));
    return `<span class="favorite-details"><span class="favorite-primary"><span class="favorite-name favorite-list-name" title="${name}">${name}</span><span class="favorite-title" title="${title}">${title}</span></span><span class="favorite-secondary"><span class="favorite-category favorite-list-category" title="${category}">${category}</span><span class="favorite-meta favorite-list-meta" title="방송 시간 (hh:mm:ss)">${duration}</span></span></span>`;
  }

  // src/viewer/controllers/favorites.js
  function create6(context) {
    const { scope, showNotice, refreshChannelManager, escapeHtml } = context;
    const addToListFromFavorite = (favorite) => context.addFavorite(favorite);
    let favorites = [], favoriteGroups = [], groupManager = null;
    function applyFavoriteSnapshot(snapshot) {
      favorites = snapshot.favorites;
      favoriteGroups = snapshot.groups;
    }
    function ensureFavoriteGroups() {
      applyFavoriteSnapshot(CZFavoritesStore.snapshot(favorites, favoriteGroups));
    }
    async function loadFavorites() {
      const snapshot = await CZFavoritesStore.read();
      favorites = snapshot.favorites;
      favoriteGroups = snapshot.groups;
    }
    const favoriteDuration = CZFavoritesStore.favoriteDuration;
    function updateFavoriteMeta() {
      const ui = context.ui;
      if (!ui) return;
      ui.querySelectorAll(".favorite-list-row").forEach((row) => {
        const fav = favorites.find((f) => f.uid === row.dataset.uid);
        const meta = row.querySelector(".favorite-list-meta");
        if (fav && meta) meta.textContent = favoriteDuration(fav);
      });
    }
    function favoriteItemsForGroup(group) {
      return CZFavoritesStore.itemsForGroup(favorites, group);
    }
    function refreshFavoriteList() {
      const ui = context.ui;
      if (!ui) return;
      ensureFavoriteGroups();
      const list = ui.querySelector("#favoriteList");
      if (!list) return;
      const displayGroups = [...favoriteGroups, ...favoriteItemsForGroup("").length ? [""] : []];
      list.innerHTML = displayGroups.map((group) => {
        const allItems = favoriteItemsForGroup(group);
        const items = CZGroupManager.visibleItems(group, allItems);
        const online = items.filter((f) => f.online);
        return `<details class="favorite-list-group" open data-group="${escapeHtml(group)}">
        <summary class="favorite-list-group-summary">
          <span class="favorite-list-group-name">${escapeHtml(group || "그룹 없음")}</span>
          <span class="favorite-list-group-count">(${allItems.length})</span>
          ${online.length ? `<button class="favorite-group-open-online" type="button" data-group="${escapeHtml(group)}">온라인 ${online.length}개 멀티뷰</button>` : ""}
        </summary>
        <div class="favorite-list-group-items">
          ${items.map((f) => `<div class="favorite-list-row ${f.online ? "online" : "offline"}" data-uid="${escapeHtml(f.uid)}">
            <span class="favorite-status-dot ${f.online ? "online" : ""}"></span>
            <button class="favorite-list-add" title="방송 추가">${favoriteDetails(f)}<span class="favorite-online-badge ${f.online ? "online" : "offline"}">${f.online ? "ONLINE" : "OFFLINE"}</span></button>
          </div>`).join("") || '<div class="favorite-list-empty">표시할 방송이 없습니다.</div>'}
        </div>
      </details>`;
      }).join("");
      CZGroupManager.decorate(ui);
      groupManager?.refreshActive();
      list.querySelectorAll(".favorite-list-add").forEach((btn) => btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const uid = btn.closest(".favorite-list-row")?.dataset.uid;
        if (!uid) return;
        const fav = favorites.find((f) => f.uid === uid);
        addToListFromFavorite(fav);
        ui.querySelector("#favoriteManager")?.removeAttribute("open");
      }));
      list.querySelectorAll(".favorite-group-open-online").forEach((btn) => btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        favoriteItemsForGroup(btn.dataset.group).filter((f) => f.online).forEach((f) => addToListFromFavorite(f));
      }));
    }
    async function saveFavorites() {
      applyFavoriteSnapshot(CZFavoritesStore.snapshot(favorites, favoriteGroups));
      try {
        await CZFavoritesStore.write(favorites, favoriteGroups);
        return true;
      } catch (error) {
        if (!isExtensionContextInvalidated(error)) throw error;
        showNotice("확장 연결이 끊겨 변경은 현재 화면에만 적용됩니다. 저장·다른 화면 동기화는 사용할 수 없습니다.");
        return false;
      }
    }
    const fetchFavoriteLive = CZChzzkApi.fetchFavoriteInfo;
    function isExtensionContextInvalidated(error) {
      return String(error?.message || error).includes("Extension context invalidated");
    }
    let favoriteRefreshInFlight = null;
    function refreshFavoriteOnlineStatus(...args) {
      if (favoriteRefreshInFlight) return favoriteRefreshInFlight;
      favoriteRefreshInFlight = performFavoriteOnlineRefresh(...args).finally(() => {
        favoriteRefreshInFlight = null;
      });
      return favoriteRefreshInFlight;
    }
    async function performFavoriteOnlineRefresh(notify = true, { persist = true } = {}) {
      if (!favorites.length) return;
      const uids = favorites.map((f) => f.uid);
      const results = await CZChzzkApi.parallelMap(uids, (uid) => fetchFavoriteLive(uid, { throwOnError: true }));
      if (scope.isDisposed) return;
      const updates = Object.fromEntries(uids.map((uid, i) => [uid, results[i]]));
      favorites = CZFavoritesStore.mergeInfo(favorites, updates);
      if (persist) {
        try {
          applyFavoriteSnapshot(await CZFavoritesStore.writeInfo(updates));
        } catch (error) {
          if (!isExtensionContextInvalidated(error)) throw error;
          persist = false;
        }
      }
      if (scope.isDisposed) return;
      refreshFavoriteList();
      if (notify) showNotice(persist ? "즐겨찾기 온라인 상태를 갱신했습니다." : "현재 화면의 온라인 상태를 갱신했습니다. 확장 연결이 끊겨 저장·다른 화면 동기화는 사용할 수 없습니다.");
    }
    function isFavorite(uid) {
      return favorites.some((f) => f.uid === uid);
    }
    function toggleFavorite(uid, title = uid) {
      if (isFavorite(uid)) favorites = favorites.filter((f) => f.uid !== uid);
      else {
        const nextOrder = favorites.reduce((max, f) => Math.max(max, Number(f.order) || 0), 0) + 1;
        favorites.push({ uid, name: title || uid, title: title || uid, group: "", groups: [], online: false, openAt: null, category: "", order: nextOrder });
      }
      ensureFavoriteGroups();
      saveFavorites().catch(console.warn);
      refreshFavoriteList();
      refreshChannelManager();
    }
    function bind4() {
      const ui = context.ui;
      groupManager = CZGroupManager.attach({
        root: ui,
        getActiveChannels: () => context.state.channels,
        onSaved: (snapshot) => {
          applyFavoriteSnapshot(snapshot);
          refreshFavoriteList();
          refreshChannelManager();
        },
        onAdd: (channel) => addToListFromFavorite(channel),
        onOpen: (kind) => {
          for (const id of ["syncManager", "volumeManager", "channelManager"]) ui.querySelector(`#${id}`)?.removeAttribute("open");
          if (kind === "following") ui.querySelector("#favoriteManager").removeAttribute("open");
        }
      });
      ui.querySelector("#followingManager").addEventListener("toggle", () => {
        if (ui.querySelector("#followingManager").open) ui.querySelector("#favoriteManager").removeAttribute("open");
      });
      ui.querySelector("#favoriteManager").addEventListener("toggle", () => {
        if (ui.querySelector("#favoriteManager").open) ui.querySelector("#followingManager").removeAttribute("open");
      });
      ui.querySelector("#favoriteManageGroups").addEventListener("click", () => groupManager.open().catch((error) => showNotice(error.message)));
      let syncPending = false;
      scope.add(CZFavoritesStore.subscribe(() => {
        if (syncPending) return;
        syncPending = true;
        queueMicrotask(async () => {
          syncPending = false;
          if (scope.isDisposed) return;
          try {
            await loadFavorites();
            if (scope.isDisposed) return;
            refreshFavoriteList();
            if (!scope.isDisposed) groupManager.sync();
          } catch (err) {
            console.warn("즐겨찾기 동기화 실패:", err);
          }
        });
      }));
      ui.querySelector("#favoriteRefresh").addEventListener("click", async () => {
        const btn = ui.querySelector("#favoriteRefresh");
        btn.disabled = true;
        let persist = true;
        try {
          try {
            await loadFavorites();
          } catch (error) {
            if (!isExtensionContextInvalidated(error)) throw error;
            persist = false;
          }
          refreshFavoriteList();
          if (!favorites.length) {
            showNotice(persist ? "새로고침할 즐겨찾기 방송이 없습니다." : "확장 연결이 끊겼으며 현재 화면에 조회할 즐겨찾기가 없습니다.");
            return;
          }
          await refreshFavoriteOnlineStatus(true, { persist });
        } catch (error) {
          console.error("즐겨찾기 새로고침 실패:", error);
          showNotice(persist ? "즐겨찾기 새로고침에 실패했습니다. 기존 표시 상태를 유지합니다." : "확장 연결이 끊긴 상태에서 방송 상태 조회도 실패했습니다. 기존 표시 상태를 유지합니다.");
        } finally {
          if (btn) btn.disabled = false;
        }
      });
      scope.interval(updateFavoriteMeta, 1e3);
      scope.interval(() => {
        if (favoriteRefreshInFlight || ui.querySelector('[data-dragging="true"]')) return;
        refreshFavoriteOnlineStatus(false).catch((error) => console.warn("즐겨찾기 자동 상태 조회 실패:", error));
      }, 3e4);
    }
    return {
      get items() {
        return favorites;
      },
      get groups() {
        return favoriteGroups;
      },
      load: loadFavorites,
      apply: applyFavoriteSnapshot,
      refresh: refreshFavoriteList,
      refreshOnline: refreshFavoriteOnlineStatus,
      isFavorite,
      toggle: toggleFavorite,
      bind: bind4,
      refreshActive() {
        groupManager?.refreshActive();
      }
    };
  }

  // src/viewer/controllers/volume-panel.js
  function create7(context) {
    const { displayChannelName, escapeHtml } = context;
    const clamp01 = (value) => context.audio.clamp01(value);
    const isForcedMuted = (channel) => context.audio.isForcedMuted(channel);
    const setTileVolume = (...args) => context.audio.setTileVolume(...args);
    const toggleTileMute = (...args) => context.audio.toggleTileMute(...args);
    let volumeListSig = "", activeRange = null;
    const ICON_SPEAKER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    const ICON_SPEAKER_MUTED = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    function bindRangeDrag(input) {
      const start = () => {
        activeRange = input;
      };
      const end = () => {
        if (activeRange === input) activeRange = null;
        syncVolumeUI();
      };
      input.addEventListener("pointerdown", start);
      input.addEventListener("change", end);
      input.addEventListener("pointerup", end);
      input.addEventListener("pointercancel", end);
      input.addEventListener("blur", end);
    }
    function buildVolumeList() {
      const { ui, state } = context;
      const list = ui?.querySelector("#tileVolumeList");
      if (!list) return null;
      const sig = state.channels.map((c) => `${c.uid}\0${displayChannelName(c)}`).join("\n");
      if (sig === volumeListSig && (list.children.length > 0 || !state.channels.length)) return list;
      volumeListSig = sig;
      activeRange = null;
      if (!state.channels.length) {
        list.innerHTML = '<div class="volume-empty">방송을 추가하면 개별 볼륨을 조절할 수 있습니다.</div>';
        return list;
      }
      list.innerHTML = state.channels.map((c) => `
      <div class="tile-volume-row" data-uid="${escapeHtml(c.uid)}">
        <div class="tile-volume-top">
          <span class="tile-volume-name">${escapeHtml(displayChannelName(c))}</span>
          <output></output>
        </div>
        <div class="volume-slider-line"><button type="button" class="tile-mute-btn" title="음소거"></button><input type="range" min="0" max="100" step="1" value="100"></div>
      </div>`).join("");
      list.querySelectorAll(".tile-volume-row").forEach((row) => {
        const uid = row.dataset.uid;
        const input = row.querySelector("input");
        input.addEventListener("input", () => setTileVolume(uid, Number(input.value) / 100));
        bindRangeDrag(input);
        row.querySelector(".tile-mute-btn").addEventListener("click", (e) => {
          e.preventDefault();
          toggleTileMute(uid);
        });
      });
      return list;
    }
    function syncVolumeUI() {
      const { ui, state } = context;
      if (!ui) return;
      const master = ui.querySelector("#masterVolume");
      const masterValue = ui.querySelector("#masterVolumeValue");
      const mainCheck = ui.querySelector("#mainOnlyCheck");
      const masterPct = Math.round(clamp01(state.masterVolume ?? 1) * 100);
      const masterMuteBtn = ui.querySelector("#masterMuteBtn");
      if (master && activeRange !== master) master.value = String(masterPct);
      if (masterValue) masterValue.textContent = `${masterPct}%`;
      if (masterMuteBtn) {
        const muted = masterPct <= 0;
        masterMuteBtn.innerHTML = muted ? ICON_SPEAKER_MUTED : ICON_SPEAKER;
        masterMuteBtn.title = muted ? "전체 음소거 해제" : "전체 음소거";
        masterMuteBtn.classList.toggle("is-muted", muted);
      }
      if (mainCheck) mainCheck.checked = state.mainOnly === true;
      const list = buildVolumeList();
      if (!list) return;
      list.querySelectorAll(".tile-volume-row").forEach((row) => {
        const channel = state.channels.find((c) => c.uid === row.dataset.uid);
        if (!channel) return;
        const pct = Math.round(clamp01(channel.volume ?? 1) * 100);
        const input = row.querySelector("input");
        const output = row.querySelector("output");
        const muteBtn = row.querySelector(".tile-mute-btn");
        const ownMuted = channel.muted === true || pct <= 0;
        const forced = isForcedMuted(channel);
        if (input && activeRange !== input) input.value = String(pct);
        if (output) output.textContent = ownMuted ? "음소거" : `${pct}%`;
        if (muteBtn) {
          const html2 = ownMuted ? ICON_SPEAKER_MUTED : ICON_SPEAKER;
          if (muteBtn.dataset.state !== (ownMuted ? "m" : "u")) {
            muteBtn.innerHTML = html2;
            muteBtn.dataset.state = ownMuted ? "m" : "u";
          }
          muteBtn.classList.toggle("is-muted", ownMuted);
          muteBtn.title = ownMuted ? "음소거 해제" : "음소거";
        }
        row.classList.toggle("is-forced", forced && !ownMuted);
        row.title = forced && !ownMuted ? clamp01(state.masterVolume ?? 1) <= 0 ? "전체 볼륨이 0이라 소리가 나지 않습니다." : "메인만 듣기로 인해 음소거 중입니다." : "";
      });
    }
    function refreshVolumeManager() {
      syncVolumeUI();
    }
    function bind4() {
      const ui = context.ui, master = ui.querySelector("#masterVolume");
      master.addEventListener("input", (event) => context.audio.setMasterVolume(Number(event.target.value) / 100));
      bindRangeDrag(master);
      ui.querySelector("#mainOnlyCheck").addEventListener("change", (event) => context.audio.setMainOnly(event.target.checked));
      ui.querySelector("#masterMuteBtn").addEventListener("click", (event) => {
        event.preventDefault();
        context.audio.toggleMasterMute();
      });
    }
    return { bind: bind4, sync: syncVolumeUI, refresh: refreshVolumeManager };
  }

  // src/viewer/controllers/channel-list.js
  function create8(context) {
    const { scheduleSyncRender, escapeHtml, displayChannelName, isFavorite, toggleFavorite, removeChannel } = context;
    function refreshChannelManager() {
      const { ui, state } = context;
      if (!ui) return;
      context.refreshActive();
      scheduleSyncRender();
      const list = ui.querySelector("#channelList");
      if (!list) return;
      list.innerHTML = state.channels.map((channel, index) => `
      <div class="channel-list-row" data-uid="${escapeHtml(channel.uid)}">
        <div class="channel-list-select">
          <span class="channel-list-index ${channel.uid === state.selectedUid ? "is-main" : ""}" ${channel.uid === state.selectedUid ? 'aria-label="현재 메인 방송" title="현재 메인 방송"' : ""}>${index + 1}</span>
          <span class="channel-list-name">${escapeHtml(displayChannelName(channel))}</span>
        </div>
        <button class="channel-list-favorite" title="즐겨찾기 토글">${isFavorite(channel.uid) ? "★" : "☆"}</button>
        <button class="channel-list-remove" title="방송 삭제">✕</button>
      </div>`).join("");
      list.querySelectorAll(".channel-list-favorite").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const uid = btn.closest(".channel-list-row")?.dataset.uid;
          const channel = context.state.channels.find((c) => c.uid === uid);
          if (!uid) return;
          toggleFavorite(uid, displayChannelName(channel) || uid);
          refreshChannelManager();
        });
      });
      list.querySelectorAll(".channel-list-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const uid = btn.closest(".channel-list-row")?.dataset.uid;
          if (uid) removeChannel(uid);
        });
      });
    }
    return { refresh: refreshChannelManager };
  }

  // src/viewer/viewer.js
  (() => {
    if (window.top !== window) return;
    if (window.__CHZZK_MULTIVIEW_PAGE_LOADED__) return;
    window.__CHZZK_MULTIVIEW_PAGE_LOADED__ = true;
    const scope = new ResourceScope();
    const ROOT_ID = "__chzzk_multiview_v09__";
    const DEFAULT_STATE = CZSessionStore.DEFAULT_STATE;
    let state = { ...DEFAULT_STATE };
    let ui = null;
    let videoGrid = null;
    let chatPanel = null;
    let chatFrame = null;
    let importantChat = null;
    let tileMap = /* @__PURE__ */ new Map();
    let dragUid = null;
    function displayChannelName(channel) {
      return channel?.name || (channel?.title && !channel.title.startsWith("CHZZK ") ? channel.title : channel?.uid || "");
    }
    const session = create5({ get state() {
      return state;
    }, scope, open: (inputs) => openMultiView("", inputs) });
    function saveState() {
      session.save();
    }
    function saveStateSoon() {
      session.saveSoon();
    }
    const shell = create3({
      get state() {
        return state;
      },
      get ui() {
        return ui;
      },
      scope,
      tileMap,
      saveState,
      applyLayout: (...args) => applyLayout(...args),
      updateChat: (...args) => updateChat(...args),
      resizeFixedAspectGrid: (...args) => resizeFixedAspectGrid(...args)
    });
    const { applyTileLock, setScreenLock, toggleScreenLock, toggleToolbar, updateToolbarToggleUI, setChatSide, toggleChatSide, setChatOpen, toggleChat, showNotice } = shell;
    function createUI() {
      const mounted = mount({ rootId: ROOT_ID, siteMode: !!globalThis.CZ_SITE_VIEWER });
      if (!mounted) return;
      ({ ui, videoGrid, chatPanel } = mounted);
      mediaTools2.bindSettings();
      importantChat = importantChatPanel.create({ chatPanel, enabledControl: ui.querySelector("#importantChatEnabled"), getFrame: () => chatFrame, getState: () => state, notify: showNotice });
      scope.add(() => importantChat.dispose());
      scope.frame(() => {
        mvResizeObserver.observe(videoGrid);
        mvResizeObserver.observe(ui);
      });
      bind2({
        mediaTools: mediaTools2,
        get state() {
          return state;
        },
        ui,
        addFromInput,
        clearAll,
        favoriteController,
        toggleToolbar,
        toggleChat,
        toggleChatSide,
        toggleScreenLock,
        scope,
        saveState,
        syncShortcutSettings,
        importantChat,
        powerDiagnostics: powerDiagnostics2,
        volumePanel,
        renderSyncUI,
        resetAllSync,
        adjustSync,
        resetSync,
        moveSelectedToFront,
        applyLayout,
        updateLayoutToggle,
        refreshFavoriteList,
        refreshChannelManager,
        setChatOpen,
        setChatSide,
        setScreenLock,
        updateToolbarToggleUI,
        syncVolumeUI
      });
    }
    const favoriteController = create6({ scope, get ui() {
      return ui;
    }, get state() {
      return state;
    }, showNotice, refreshChannelManager, escapeHtml, addFavorite: addToListFromFavorite });
    const volumePanel = create7({ get ui() {
      return ui;
    }, get state() {
      return state;
    }, get audio() {
      return audio2;
    }, displayChannelName, escapeHtml });
    const channelList = create8({
      get ui() {
        return ui;
      },
      get state() {
        return state;
      },
      scheduleSyncRender: (...args) => scheduleSyncRender(...args),
      escapeHtml,
      displayChannelName,
      refreshActive: () => favoriteController.refreshActive(),
      isFavorite: (uid) => favoriteController.isFavorite(uid),
      toggleFavorite: (...args) => favoriteController.toggle(...args),
      removeChannel
    });
    function applyFavoriteSnapshot(snapshot) {
      favoriteController.apply(snapshot);
    }
    function refreshFavoriteList() {
      favoriteController.refresh();
    }
    function refreshFavoriteOnlineStatus(...args) {
      return favoriteController.refreshOnline(...args);
    }
    function refreshChannelManager() {
      channelList.refresh();
    }
    function syncVolumeUI() {
      volumePanel.sync();
    }
    function refreshVolumeManager() {
      volumePanel.refresh();
    }
    const { isChannelVisibleInLayout, createTile, moveSelectedToFront, selectChannel, syncSelection } = players.create({ get mediaTools() {
      return mediaTools2;
    }, get state() {
      return state;
    }, get videoGrid() {
      return videoGrid;
    }, get dragUid() {
      return dragUid;
    }, set dragUid(value) {
      dragUid = value;
    }, tileMap, escapeHtml: (...args) => escapeHtml(...args), displayChannelName: (...args) => displayChannelName(...args), removeChannel: (...args) => removeChannel(...args), showNotice: (...args) => showNotice(...args), applyLayout: (...args) => applyLayout(...args), updateChat: (...args) => updateChat(...args), refreshChannelManager: (...args) => refreshChannelManager(...args), saveState: (...args) => saveState(...args), applyTileLock: (...args) => applyTileLock(...args), syncVolumeUI: (...args) => syncVolumeUI(...args), clearSyncState: (...args) => clearSyncState(...args), sendTileVolume: (...args) => sendTileVolume(...args), makeMainAudible: (...args) => makeMainAudible(...args) });
    let unmuteRequest = null;
    function ensureViewerAudible() {
      if (unmuteRequest) return;
      unmuteRequest = chrome.runtime.sendMessage({ type: "UNMUTE_VIEWER_TAB", tabId: session.tabId }).then((result) => {
        if (!result?.ok) showNotice("브라우저 탭 음소거 해제 실패: " + (result?.error || "탭 상태를 확인해주세요."));
      }).catch((error) => showNotice("탭 음소거 상태 확인 실패: " + error.message)).finally(() => {
        unmuteRequest = null;
      });
    }
    const audio2 = audio.create({ ensureAudible: ensureViewerAudible, get state() {
      return state;
    }, tileMap, syncVolumeUI, saveStateSoon, saveState });
    const { sendTileVolume, makeMainAudible, receiveVideoState } = audio2;
    const { externalSeek, adjustSync, resetSync, resetAllSync, clearSyncState, clearAllSyncState, handleSyncResult, handleSyncState, scheduleSyncRender, renderSyncUI } = sync.create({ get state() {
      return state;
    }, get ui() {
      return ui;
    }, tileMap, showNotice, escapeHtml, displayChannelName });
    function syncShortcutSettings() {
      ui.dataset.chatTimestamps = String(state.chatTimestamps === true);
      CZMessages.postToPlayer(chatFrame, { source: "chzzk-multiview", type: "CHAT_TIMESTAMP_CONFIG", enabled: state.chatTimestamps === true });
      CZMessages.postToPlayer(chatFrame, { source: "chzzk-multiview", type: "MEDIA_SHORTCUTS", enabled: state.shortcutsEnabled !== false });
      for (const tile of tileMap.values()) {
        CZMessages.postToPlayer(tile.querySelector("iframe"), { source: "chzzk-multiview", type: "MEDIA_SHORTCUTS", enabled: state.shortcutsEnabled !== false });
        CZMessages.postToPlayer(tile.querySelector("iframe"), { source: "chzzk-multiview", type: "POWER_REWARDS_CONFIG", enabled: state.powerRewards === true });
      }
    }
    function handleShortcut(key) {
      if (state.shortcutsEnabled === false) return;
      if (["f", "v"].includes(key)) {
        const collapsed = shell.collapsed;
        if (collapsed) toggleToolbar();
        const panel = ui.querySelector(key === "f" ? "#favoriteManager" : "#volumeManager");
        panel.open = collapsed || !panel.open;
        if (panel.open) ui.querySelector("#settingsManager").removeAttribute("open");
      } else if (key === "h") toggleScreenLock();
      else if (key === "b") toggleToolbar();
      else if (key === "c") toggleChat();
      else if (key === "g") ui.querySelector(`.layout-toggle-btn[data-layout="${state.layout === "grid" ? "main-sub" : "grid"}"]`).click();
    }
    const powerDiagnostics2 = powerDiagnostics.create({ get state() {
      return state;
    }, get ui() {
      return ui;
    }, tileMap });
    const mediaTools2 = mediaTools.create({ get shortcutsEnabled() {
      return state.shortcutsEnabled !== false;
    }, onShortcut: handleShortcut, get state() {
      return state;
    }, get ui() {
      return ui;
    }, tileMap, showNotice, adjustSync, externalSeek });
    scope.add(() => mediaTools2.dispose());
    bind3({
      scope,
      tileMap,
      powerDiagnostics: powerDiagnostics2,
      clearSyncState,
      sendTileVolume,
      mediaTools: mediaTools2,
      receiveVideoState,
      handleSyncState,
      handleSyncResult,
      get state() {
        return state;
      },
      get chatFrame() {
        return chatFrame;
      },
      get importantChat() {
        return importantChat;
      }
    });
    const { updateLayoutToggle, applyLayout, resizeFixedAspectGrid } = create2({
      get state() {
        return state;
      },
      get ui() {
        return ui;
      },
      get videoGrid() {
        return videoGrid;
      },
      tileMap,
      scope,
      onRemove: (uid) => mediaTools2.detach(uid),
      createTile,
      sendTileVolume,
      applyTileLock,
      refreshChannelManager,
      refreshVolumeManager
    });
    const { updateChat } = chat.create({ onUpdated: () => importantChat?.sync(), get state() {
      return state;
    }, get chatPanel() {
      return chatPanel;
    }, get chatFrame() {
      return chatFrame;
    }, set chatFrame(value) {
      chatFrame = value;
    } });
    function escapeHtml(value) {
      return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }
    const channels = create4({
      get state() {
        return state;
      },
      set state(value) {
        state = value;
      },
      get ui() {
        return ui;
      },
      scope,
      tileMap,
      session,
      mediaTools: mediaTools2,
      favorites: favoriteController,
      reconcileAudio: audio2.reconcile,
      showNotice,
      saveState,
      applyLayout,
      updateChat,
      refreshChannelManager,
      syncSelection,
      updateLayoutToggle,
      isChannelVisibleInLayout,
      createTile,
      selectChannel,
      clearSyncState,
      clearAllSyncState,
      makeMainAudible,
      moveSelectedToFront,
      syncVolumeUI,
      createUI,
      refreshFavoriteList,
      refreshFavoriteOnlineStatus,
      applyFavoriteSnapshot
    });
    function addFromInput() {
      channels.addFromInput();
    }
    function removeChannel(uid) {
      channels.removeChannel(uid);
    }
    function clearAll() {
      channels.clearAll();
    }
    function addToListFromFavorite(favorite) {
      channels.addFavorite(favorite);
    }
    function openMultiView(...args) {
      return channels.open(...args);
    }
    const boot = async () => {
      await session.register(!!globalThis.CZ_SITE_VIEWER);
      const query = new URL(location.href).searchParams;
      let inputs = [];
      if (!globalThis.CZ_SITE_VIEWER && query.has("inputs")) inputs = JSON.parse(query.get("inputs"));
      await chrome.runtime.sendMessage({ type: "COOKIE_BRIDGE_INIT" });
      await openMultiView("", Array.isArray(inputs) ? inputs : []);
      if (!globalThis.CZ_SITE_VIEWER) history.replaceState(null, "", location.pathname);
      session.markReady();
      if (!globalThis.CZ_SITE_VIEWER) document.body.classList.add("ready");
    };
    boot().catch((error) => {
      console.error(error);
      scope.dispose();
      document.getElementById(ROOT_ID)?.remove();
      if (document.getElementById("startupStatus")) document.getElementById("startupStatus").textContent = "멀티뷰를 열지 못했습니다. 확장을 다시 로드한 뒤 페이지를 새로고침해주세요.";
    });
    scope.listen(window, "pagehide", (event) => {
      saveState();
      if (!event.persisted) scope.dispose();
    });
    const scheduleGridResize = () => {
      resizeFixedAspectGrid();
    };
    const mvResizeObserver = new ResizeObserver(scheduleGridResize);
    scope.observe(mvResizeObserver);
    scope.listen(window, "resize", scheduleGridResize, { passive: true });
    if (window.visualViewport) {
      scope.listen(window.visualViewport, "resize", scheduleGridResize, { passive: true });
    }
  })();
})();
