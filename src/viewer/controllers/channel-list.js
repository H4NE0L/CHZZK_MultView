export function create(context) {
  const {scheduleSyncRender,escapeHtml,displayChannelName,isFavorite,toggleFavorite,removeChannel}=context;
  function refreshChannelManager() {
    const {ui,state}=context;
    if (!ui) return;
    context.refreshActive();
    scheduleSyncRender();
    const list = ui.querySelector("#channelList");
    if (!list) return;
    list.innerHTML = state.channels.map((channel, index) => `
      <div class="channel-list-row" data-uid="${escapeHtml(channel.uid)}">
        <div class="channel-list-select">
          <span class="channel-list-index ${channel.uid === state.selectedUid ? 'is-main' : ''}" ${channel.uid === state.selectedUid ? 'aria-label="현재 메인 방송" title="현재 메인 방송"' : ''}>${index + 1}</span>
          <span class="channel-list-name">${escapeHtml(displayChannelName(channel))}</span>
        </div>
        <button class="channel-list-favorite" title="즐겨찾기 토글">${isFavorite(channel.uid) ? "★" : "☆"}</button>
        <button class="channel-list-remove" title="방송 삭제">✕</button>
      </div>`).join("");

    list.querySelectorAll(".channel-list-favorite").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const uid = btn.closest(".channel-list-row")?.dataset.uid;
        const channel = context.state.channels.find(c => c.uid === uid);
        if (!uid) return;
        toggleFavorite(uid, displayChannelName(channel) || uid);
        refreshChannelManager();
      });
    });
    list.querySelectorAll(".channel-list-remove").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const uid = btn.closest(".channel-list-row")?.dataset.uid;
        if (uid) removeChannel(uid);
      });
    });
  }

  return {refresh:refreshChannelManager};
}
