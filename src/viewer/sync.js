export const sync = {create(context) {
  const {tileMap, showNotice, escapeHtml, displayChannelName} = context;
  const syncOffsets = new Map();   // uid -> applied adjustment (ms)
  const syncDelays = new Map();    // uid -> { delay, canSeek, t }
  const syncPending = new Map();   // requestId -> { uid, reset }
  const SYNC_STATE_STALE_MS = 5000;
  let syncRequestSeq = 0;
  let syncSig = "";
  let syncFrame = 0;

  function formatSyncSeconds(ms) {
    if (!ms) return "0초";
    const seconds = Number((Math.abs(ms) / 1000).toFixed(2));
    return `${ms < 0 ? "-" : "+"}${seconds}초`;
  }

  function syncState(channel) {
    if (channel.type === "video") return { supported: false, note: "다시보기는 싱크 조정을 지원하지 않습니다." };
    if (!tileMap.has(channel.uid)) return { supported: false, note: "화면에 표시 중인 방송이 아닙니다." };
    return { supported: true, note: "" };
  }

  function requestSync(uid, deltaSeconds, reset = false) {
    const iframe = tileMap.get(uid)?.querySelector("iframe");
    if (!iframe?.contentWindow) return;
    const requestId = ++syncRequestSeq;
    syncPending.set(requestId, { uid, reset });
    setTimeout(() => {
      if (syncPending.delete(requestId)) showNotice("싱크 조정 응답이 없습니다. 방송이 아직 로딩 중일 수 있습니다.");
    }, 2500);
    try {
      CZMessages.postToPlayer(iframe, {
        source: "chzzk-multiview", type: "SYNC_SEEK", requestId, delta: deltaSeconds
      });
    } catch (_) {
      syncPending.delete(requestId);
    }
  }

  function externalSeek(uid, applied) {
    if (!Number.isFinite(applied)) return;
    syncOffsets.set(uid,(syncOffsets.get(uid)||0)+applied*1000);
    scheduleSyncRender();
  }
  function adjustSync(uid, deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return;
    requestSync(uid, deltaSeconds, false);
  }

  function resetSync(uid) {
    const offset = syncOffsets.get(uid) || 0;
    if (!offset) return;
    requestSync(uid, -offset / 1000, true);
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
      showNotice(data.reason === "not-seekable"
        ? "이 방송은 아직 싱크를 조정할 수 없습니다. 재생이 시작된 뒤 다시 시도하세요."
        : "싱크를 조정하지 못했습니다.");
      return;
    }

    const applied = Math.round((Number(data.applied) || 0) * 1000);
    let next = (syncOffsets.get(data.uid) || 0) + applied;
    if (Math.abs(next) < 10) next = 0;
    if (next === 0) syncOffsets.delete(data.uid); else syncOffsets.set(data.uid, next);

    if (typeof data.delay === "number" && Number.isFinite(data.delay)) {
      syncDelays.set(data.uid, { delay: data.delay, canSeek: true, t: Date.now() });
    }

    if (data.clamped) {
      const forward = Number(data.requested) > 0;
      showNotice(applied === 0
        ? (forward ? "더 이상 앞으로 당길 수 없습니다. (라이브에 가장 가깝습니다)" : "더 이상 뒤로 돌릴 수 없습니다.")
        : "한계에 도달하여 일부만 적용되었습니다.");
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

    // Always keep the toolbar badge and the top summary up to date.
    const adjusted = context.state.channels.filter(c => syncOffsets.get(c.uid));
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
      summary.innerHTML = adjusted.length
        ? adjusted.map(c => `<span class="sync-chip"><b>${escapeHtml(displayChannelName(c))}</b>${formatSyncSeconds(syncOffsets.get(c.uid))}</span>`).join("")
        : '<span class="sync-summary-empty">싱크를 조정한 방송이 없습니다.</span>';
    }

    const panel = context.ui.querySelector("#syncManager");
    const list = context.ui.querySelector("#syncList");
    if (!panel?.open || !list) return;

    const sig = context.state.channels.map(c => `${c.uid}\u0000${displayChannelName(c)}\u0000${c.uid === context.state.selectedUid ? 1 : 0}\u0000${syncState(c).supported ? 1 : 0}`).join("\n");
    if (sig !== syncSig) {
      syncSig = sig;
      list.innerHTML = context.state.channels.length ? context.state.channels.map(c => {
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
            <button type="button" data-reset title="이 방송의 싱크 조정을 초기화"${dis}>초기화</button>
          </div>
        </div>`;
      }).join("") : '<div class="volume-empty">방송을 추가하면 싱크를 조정할 수 있습니다.</div>';
    }

    list.querySelectorAll(".sync-row").forEach(row => {
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
    syncOffsets.clear(); syncDelays.clear(); syncPending.clear(); scheduleSyncRender();
  }
  return {externalSeek, adjustSync, resetSync, resetAllSync, clearSyncState, clearAllSyncState, handleSyncResult, handleSyncState, scheduleSyncRender, renderSyncUI};
}};
