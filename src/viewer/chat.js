globalThis.CZChat = {create(context) {
  function updateChat() {
    const uid = context.state.selectedUid;
    const selected = context.state.channels.find(c => c.uid === uid);
    context.chatPanel.querySelector('.chat-head strong').textContent = selected ? `채팅 · ${selected.name || selected.uid}` : '채팅';

    if (!uid) {
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
      context.chatFrame.addEventListener("load", () => {
        try {
          context.chatFrame.contentWindow.postMessage({
            source: "chzzk-multiview", type: "SET_CHAT_MODE", visible: true
          }, "https://chzzk.naver.com");
        } catch (_) {}
      });
    }

    const channel = context.state.channels.find(c => c.uid === uid);
    const target = channel?.type === "video"
      ? `${channel.url}${channel.url.includes("?") ? "&" : "?"}multiview=chat`
      : `https://chzzk.naver.com/live/${encodeURIComponent(channel?.sourceId || uid)}/chat?multiview=1`;

    // Only reload chat when the selected channel changes.
    if (context.chatFrame.dataset.uid !== uid) {
      context.chatFrame.dataset.uid = uid;
      context.chatFrame.src = target;

    }
  }

  return {updateChat};
}};
