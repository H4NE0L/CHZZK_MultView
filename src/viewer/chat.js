globalThis.CZChat = {create(context) {
  function releaseChat() {
    const frame = context.chatFrame;
    context.chatFrame = null;
    if (frame) {
      frame.onload = null;
      frame.dataset.playerReady = 'false';
      frame.src = 'about:blank';
      frame.remove();
    }
    context.chatPanel.querySelector('.chat-frame-wrap').replaceChildren();
    context.onUpdated?.();
  }
  function updateChat() {
    const uid = context.state.selectedUid;
    const selected = context.state.channels.find(c => c.uid === uid);
    context.chatPanel.querySelector('.chat-head strong').textContent = selected ? `채팅 · ${selected.name || selected.uid}` : '채팅';

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
            source: "chzzk-multiview", type: "SET_CHAT_MODE", visible: true
          });
        } catch (_) {}
      };
    }

    const channel = context.state.channels.find(c => c.uid === uid);
    const target = channel?.type === "video"
      ? `${channel.url}${channel.url.includes("?") ? "&" : "?"}multiview=chat`
      : `https://chzzk.naver.com/live/${encodeURIComponent(channel?.sourceId || uid)}/chat?multiview=1`;

    // Only reload chat when the selected channel changes.
    if (context.chatFrame.dataset.uid !== uid) {
      context.chatFrame.dataset.uid = uid;
      context.chatFrame.dataset.playerReady = 'false';
      context.chatFrame.src = target;

    }
    context.onUpdated?.();
  }

  return {updateChat};
}};
