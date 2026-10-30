export function create(context) {
  const {displayChannelName,escapeHtml}=context;
  const clamp01=value=>context.audio.clamp01(value);
  const isForcedMuted=channel=>context.audio.isForcedMuted(channel);
  const setTileVolume=(...args)=>context.audio.setTileVolume(...args);
  const toggleTileMute=(...args)=>context.audio.toggleTileMute(...args);
  let volumeListSig='',activeRange=null;
  const ICON_SPEAKER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_SPEAKER_MUTED = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  // While a slider is being dragged, its DOM node must stay alive and keep its
  // own value; rebuilding it mid-drag is what used to break click-and-drag.
  function bindRangeDrag(input) {
    const start = () => { activeRange = input; };
    const end = () => { if (activeRange === input) activeRange = null; syncVolumeUI(); };
    input.addEventListener("pointerdown", start);
    input.addEventListener("change", end);
    input.addEventListener("pointerup", end);
    input.addEventListener("pointercancel", end);
    input.addEventListener("blur", end);
  }

  function buildVolumeList() {
    const {ui,state}=context;
    const list = ui?.querySelector("#tileVolumeList");
    if (!list) return null;

    const sig = state.channels.map(c => `${c.uid}\u0000${displayChannelName(c)}`).join("\n");
    if (sig === volumeListSig && (list.children.length > 0 || !state.channels.length)) return list;
    volumeListSig = sig;
    activeRange = null;

    if (!state.channels.length) {
      list.innerHTML = '<div class="volume-empty">방송을 추가하면 개별 볼륨을 조절할 수 있습니다.</div>';
      return list;
    }

    list.innerHTML = state.channels.map(c => `
      <div class="tile-volume-row" data-uid="${escapeHtml(c.uid)}">
        <div class="tile-volume-top">
          <span class="tile-volume-name">${escapeHtml(displayChannelName(c))}</span>
          <output></output>
        </div>
        <div class="volume-slider-line"><button type="button" class="tile-mute-btn" title="음소거"></button><input type="range" min="0" max="100" step="1" value="100"></div>
      </div>`).join("");

    list.querySelectorAll(".tile-volume-row").forEach(row => {
      const uid = row.dataset.uid;
      const input = row.querySelector("input");
      input.addEventListener("input", () => setTileVolume(uid, Number(input.value) / 100));
      bindRangeDrag(input);
      row.querySelector(".tile-mute-btn").addEventListener("click", e => {
        e.preventDefault();
        toggleTileMute(uid);
      });
    });
    return list;
  }

  // Updates existing controls in place (never recreates a slider that exists).
  function syncVolumeUI() {
    const {ui,state}=context;
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

    list.querySelectorAll(".tile-volume-row").forEach(row => {
      const channel = state.channels.find(c => c.uid === row.dataset.uid);
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
        const html = ownMuted ? ICON_SPEAKER_MUTED : ICON_SPEAKER;
        if (muteBtn.dataset.state !== (ownMuted ? "m" : "u")) {
          muteBtn.innerHTML = html;
          muteBtn.dataset.state = ownMuted ? "m" : "u";
        }
        muteBtn.classList.toggle("is-muted", ownMuted);
        muteBtn.title = ownMuted ? "음소거 해제" : "음소거";
      }
      row.classList.toggle("is-forced", forced && !ownMuted);
      row.title = forced && !ownMuted
        ? (clamp01(state.masterVolume ?? 1) <= 0 ? "전체 볼륨이 0이라 소리가 나지 않습니다." : "메인만 듣기로 인해 음소거 중입니다.")
        : "";
    });
  }

  function refreshVolumeManager() {
    syncVolumeUI();
  }

  function bind(){
    const ui=context.ui,master=ui.querySelector('#masterVolume');
    master.addEventListener('input',event=>context.audio.setMasterVolume(Number(event.target.value)/100));
    bindRangeDrag(master);
    ui.querySelector('#mainOnlyCheck').addEventListener('change',event=>context.audio.setMainOnly(event.target.checked));
    ui.querySelector('#masterMuteBtn').addEventListener('click',event=>{event.preventDefault();context.audio.toggleMasterMute();});
  }
  return {bind,sync:syncVolumeUI,refresh:refreshVolumeManager};
}
