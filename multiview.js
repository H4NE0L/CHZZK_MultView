const STORAGE_KEY = "chzzk-multiview-state";

const state = {
    layout: 2,
    channels: [],
    mainChannelId: null,
    chatEnabled: true
};

const tileMap = new Map();

let draggedChannelId = null;


/* =========================================================
   DOM
========================================================= */

const videoGrid = document.getElementById("videoGrid");

const channelInput = document.getElementById("channelInput");
const addChannelButton = document.getElementById("addChannelButton");
const removeAllButton = document.getElementById("removeAllButton");

const layout2x2Button = document.getElementById("layout2x2");
const layout3x3Button = document.getElementById("layout3x3");

const toggleChatButton = document.getElementById("toggleChat");
const chatPanel = document.getElementById("chatPanel");
const chatFrame = document.getElementById("chatFrame");
const chatEmpty = document.getElementById("chatEmpty");
const chatTitle = document.getElementById("chatTitle");

const loginButton = document.getElementById("loginButton");


/* =========================================================
   초기화
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
    await loadState();

    applyLayout();
    applyChatVisibility();

    for (const channel of state.channels) {
        createChannelTile(channel);
    }

    updateAllChannelNumbers();
    updateSelectionVisuals();
    updateChat();

    setupEvents();
});


/* =========================================================
   이벤트
========================================================= */

function setupEvents() {

    addChannelButton.addEventListener("click", () => {
        addChannel();
    });


    channelInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            addChannel();
        }
    });


    removeAllButton.addEventListener("click", () => {
        removeAllChannels();
    });


    layout2x2Button.addEventListener("click", () => {
        state.layout = 2;

        applyLayout();
        saveState();
    });


    layout3x3Button.addEventListener("click", () => {
        state.layout = 3;

        applyLayout();
        saveState();
    });


    toggleChatButton.addEventListener("click", () => {
        state.chatEnabled = !state.chatEnabled;

        applyChatVisibility();
        saveState();
    });


    loginButton.addEventListener("click", () => {
        chrome.tabs.create({
            url: "https://chzzk.naver.com/"
        });
    });


    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            const expanded = document.querySelector(".channel-tile.expanded");

            if (expanded) {
                expanded.classList.remove("expanded");
            }
        }
    });
}


/* =========================================================
   UID 파싱
========================================================= */

function parseChannelId(input) {

    input = input.trim();

    if (!input) {
        return null;
    }


    /*
     * URL인 경우
     */

    if (/^https?:\/\//i.test(input)) {

        try {

            const url = new URL(input);

            const parts = url.pathname
                .split("/")
                .filter(Boolean);

            if (parts.length === 0) {
                return null;
            }


            /*
             * /live/UID
             */

            if (parts[0].toLowerCase() === "live") {

                return parts[1] || null;
            }


            /*
             * /UID
             */

            return parts[0];

        } catch (error) {

            return null;
        }
    }


    /*
     * URL 없이 live/UID 형태로 입력한 경우
     */

    if (input.toLowerCase().startsWith("live/")) {
        return input.substring(5).split(/[/?#]/)[0];
    }


    /*
     * 그냥 UID
     */

    return input
        .split(/[/?#\s]/)[0]
        .trim();
}


/* =========================================================
   방송 추가
========================================================= */

function addChannel() {

    const channelId = parseChannelId(channelInput.value);

    if (!channelId) {
        alert("치지직 UID 또는 URL을 입력해주세요.");
        return;
    }


    /*
     * 중복 확인
     */

    if (state.channels.some(channel => channel.id === channelId)) {

        alert("이미 추가된 방송입니다.");

        channelInput.select();

        return;
    }


    const channel = {
        id: channelId,
        muted: true
    };


    state.channels.push(channel);


    /*
     * 처음 추가된 방송이라면 메인으로 지정
     */

    if (!state.mainChannelId) {
        state.mainChannelId = channelId;
    }


    /*
     * 새 타일 하나만 생성
     */

    createChannelTile(channel);


    updateAllChannelNumbers();
    updateSelectionVisuals();
    updateChat();

    saveState();


    channelInput.value = "";
    channelInput.focus();
}


/* =========================================================
   방송 타일 생성
========================================================= */

function createChannelTile(channel) {

    const tile = document.createElement("article");

    tile.className = "channel-tile";

    tile.dataset.channelId = channel.id;


    /* =========================
       상단
    ========================= */

    const header = document.createElement("div");

    header.className = "channel-header";

    header.draggable = true;


    const info = document.createElement("div");

    info.className = "channel-info";


    const number = document.createElement("span");

    number.className = "channel-number";


    const mainMark = document.createElement("span");

    mainMark.className = "main-mark";

    mainMark.textContent = "MAIN";


    const channelId = document.createElement("span");

    channelId.className = "channel-id";

    channelId.textContent = channel.id;


    info.appendChild(number);
    info.appendChild(mainMark);
    info.appendChild(channelId);


    const controls = document.createElement("div");

    controls.className = "channel-controls";


    /* 메인 */

    const mainButton = createButton("★", "메인 방송 지정");

    mainButton.classList.add("main-button");


    /* 음소거 */

    const muteButton = createButton(
        channel.muted ? "🔇" : "🔊",
        "음소거"
    );


    /* 확대 */

    const expandButton = createButton("⛶", "확대");


    /* 삭제 */

    const removeButton = createButton("×", "방송 제거");

    removeButton.classList.add("remove-button");


    controls.appendChild(mainButton);
    controls.appendChild(muteButton);
    controls.appendChild(expandButton);
    controls.appendChild(removeButton);


    header.appendChild(info);
    header.appendChild(controls);


    /* =========================
       iframe
    ========================= */

    const iframe = document.createElement("iframe");

    iframe.className = "channel-frame";

    iframe.src = `https://chzzk.naver.com/live/${channel.id}`;

    iframe.title = `CHZZK ${channel.id}`;

    iframe.allow =
        "autoplay; fullscreen; picture-in-picture";

    iframe.setAttribute("allowfullscreen", "");


    /*
     * iframe 식별용
     */

    iframe.dataset.channelId = channel.id;


    /* =========================
       타일 조립
    ========================= */

    tile.appendChild(header);
    tile.appendChild(iframe);

    videoGrid.appendChild(tile);


    /* =========================
       Map에 저장
    ========================= */

    const tileData = {
        tile,
        header,
        iframe,
        muteButton,
        mainButton,
        expandButton,
        removeButton
    };

    tileMap.set(channel.id, tileData);


    /* =========================
       선택
    ========================= */

    header.addEventListener("click", (event) => {

        if (event.target.closest(".channel-button")) {
            return;
        }

        selectChannel(channel.id);
    });


    tile.addEventListener("click", (event) => {

        if (event.target.closest(".channel-header")) {
            return;
        }

        /*
         * iframe 자체 클릭은 부모에서 받을 수 없으므로
         * 여기서는 타일 선택의 보조 기능만 담당한다.
         */

        selectChannel(channel.id);
    });


    /* =========================
       메인 지정
    ========================= */

    mainButton.addEventListener("click", (event) => {

        event.stopPropagation();

        selectChannel(channel.id);
    });


    /* =========================
       음소거
    ========================= */

    muteButton.addEventListener("click", (event) => {

        event.stopPropagation();

        toggleMute(channel.id);
    });


    /* =========================
       확대
    ========================= */

    expandButton.addEventListener("click", (event) => {

        event.stopPropagation();

        toggleExpand(tile);
    });


    /* =========================
       삭제
    ========================= */

    removeButton.addEventListener("click", (event) => {

        event.stopPropagation();

        removeChannel(channel.id);
    });


    /* =========================
       Drag & Drop
    ========================= */

    header.addEventListener("dragstart", (event) => {

        draggedChannelId = channel.id;

        tile.classList.add("dragging");

        event.dataTransfer.effectAllowed = "move";

        event.dataTransfer.setData(
            "text/plain",
            channel.id
        );
    });


    header.addEventListener("dragend", () => {

        draggedChannelId = null;

        tile.classList.remove("dragging");

        document
            .querySelectorAll(".channel-tile.drag-over")
            .forEach(element => {
                element.classList.remove("drag-over");
            });
    });


    tile.addEventListener("dragover", (event) => {

        event.preventDefault();

        if (!draggedChannelId) {
            return;
        }

        if (draggedChannelId === channel.id) {
            return;
        }

        tile.classList.add("drag-over");
    });


    tile.addEventListener("dragleave", () => {

        tile.classList.remove("drag-over");
    });


    tile.addEventListener("drop", (event) => {

        event.preventDefault();

        tile.classList.remove("drag-over");

        if (!draggedChannelId) {
            return;
        }

        if (draggedChannelId === channel.id) {
            return;
        }

        moveChannel(
            draggedChannelId,
            channel.id
        );
    });


    /*
     * iframe → 부모 메시지
     */

    window.addEventListener("message", (event) => {

        if (!event.data) {
            return;
        }

        if (event.data.source !== "chzzk-multiview") {
            return;
        }

        if (event.data.type !== "VIDEO_STATE") {
            return;
        }


        /*
         * 어떤 iframe에서 온 메시지인지 확인
         */

        for (const [id, data] of tileMap) {

            if (data.iframe.contentWindow === event.source) {

                const channel = state.channels.find(
                    item => item.id === id
                );

                if (!channel) {
                    return;
                }

                channel.muted = Boolean(event.data.muted);

                updateMuteButton(id);

                saveState();

                break;
            }
        }
    });
}


/* =========================================================
   버튼 생성
========================================================= */

function createButton(text, title) {

    const button = document.createElement("button");

    button.className = "channel-button";

    button.textContent = text;

    button.title = title;

    button.draggable = false;

    return button;
}


/* =========================================================
   방송 선택 / 메인 지정
========================================================= */

function selectChannel(channelId) {

    if (!state.channels.some(channel => channel.id === channelId)) {
        return;
    }

    state.mainChannelId = channelId;


    /*
     * 모든 타일의 iframe은 그대로 둔다.
     * class만 변경한다.
     */

    updateSelectionVisuals();


    /*
     * 채팅만 변경
     */

    updateChat();


    saveState();
}


/* =========================================================
   선택 표시
========================================================= */

function updateSelectionVisuals() {

    for (const channel of state.channels) {

        const data = tileMap.get(channel.id);

        if (!data) {
            continue;
        }

        if (channel.id === state.mainChannelId) {

            data.tile.classList.add("selected");

        } else {

            data.tile.classList.remove("selected");
        }
    }
}


/* =========================================================
   음소거
========================================================= */

function toggleMute(channelId) {

    const channel = state.channels.find(
        item => item.id === channelId
    );

    if (!channel) {
        return;
    }


    const newMuted = !channel.muted;


    /*
     * 한 방송만 소리를 내도록 한다.
     */

    if (!newMuted) {

        for (const other of state.channels) {

            if (other.id === channelId) {
                continue;
            }

            other.muted = true;

            sendMuteMessage(
                other.id,
                true
            );

            updateMuteButton(other.id);
        }
    }


    channel.muted = newMuted;


    sendMuteMessage(
        channelId,
        newMuted
    );


    updateMuteButton(channelId);

    saveState();
}


/* =========================================================
   CHZZK iframe에 음소거 명령
========================================================= */

function sendMuteMessage(channelId, muted) {

    const data = tileMap.get(channelId);

    if (!data) {
        return;
    }


    try {

        data.iframe.contentWindow.postMessage(
            {
                source: "chzzk-multiview",
                type: "SET_MUTED",
                muted
            },
            "*"
        );

    } catch (error) {

        console.warn(
            "CHZZK mute message failed:",
            error
        );
    }
}


/* =========================================================
   음소거 버튼 표시
========================================================= */

function updateMuteButton(channelId) {

    const channel = state.channels.find(
        item => item.id === channelId
    );

    const data = tileMap.get(channelId);

    if (!channel || !data) {
        return;
    }


    data.muteButton.textContent =
        channel.muted ? "🔇" : "🔊";

    data.muteButton.title =
        channel.muted ? "음소거 해제" : "음소거";
}


/* =========================================================
   위치 변경
========================================================= */

function moveChannel(fromId, toId) {

    const fromIndex = state.channels.findIndex(
        channel => channel.id === fromId
    );

    const toIndex = state.channels.findIndex(
        channel => channel.id === toId
    );


    if (fromIndex === -1 || toIndex === -1) {
        return;
    }


    /*
     * state 배열 순서 변경
     */

    const [movedChannel] =
        state.channels.splice(fromIndex, 1);

    state.channels.splice(
        toIndex,
        0,
        movedChannel
    );


    /*
     * DOM 위치만 변경
     *
     * iframe은 새로 만들지 않는다.
     */

    const movedTile =
        tileMap.get(fromId).tile;

    const targetTile =
        tileMap.get(toId).tile;


    videoGrid.insertBefore(
        movedTile,
        targetTile
    );


    updateAllChannelNumbers();

    saveState();
}


/* =========================================================
   방송 삭제
========================================================= */

function removeChannel(channelId) {

    const data = tileMap.get(channelId);

    if (!data) {
        return;
    }


    /*
     * 해당 iframe만 제거
     */

    data.tile.remove();

    tileMap.delete(channelId);


    /*
     * state에서도 제거
     */

    state.channels =
        state.channels.filter(
            channel => channel.id !== channelId
        );


    /*
     * 메인 방송이 삭제됐다면
     * 첫 번째 방송을 메인으로 지정
     */

    if (state.mainChannelId === channelId) {

        state.mainChannelId =
            state.channels.length > 0
                ? state.channels[0].id
                : null;
    }


    updateAllChannelNumbers();
    updateSelectionVisuals();
    updateChat();

    saveState();
}


/* =========================================================
   전체 삭제
========================================================= */

function removeAllChannels() {

    if (state.channels.length === 0) {
        return;
    }


    if (!confirm("모든 방송을 삭제할까요?")) {
        return;
    }


    /*
     * 모든 타일 제거
     */

    for (const data of tileMap.values()) {
        data.tile.remove();
    }


    tileMap.clear();


    state.channels = [];

    state.mainChannelId = null;


    updateChat();

    saveState();
}


/* =========================================================
   확대
========================================================= */

function toggleExpand(tile) {

    const currentExpanded =
        document.querySelector(".channel-tile.expanded");


    if (currentExpanded &&
        currentExpanded !== tile) {

        currentExpanded.classList.remove("expanded");
    }


    tile.classList.toggle("expanded");
}


/* =========================================================
   번호 갱신
========================================================= */

function updateAllChannelNumbers() {

    state.channels.forEach((channel, index) => {

        const data = tileMap.get(channel.id);

        if (!data) {
            return;
        }

        data.header
            .querySelector(".channel-number")
            .textContent = `CH ${index + 1}`;
    });
}


/* =========================================================
   레이아웃
========================================================= */

function applyLayout() {

    videoGrid.classList.toggle(
        "layout-2x2",
        state.layout === 2
    );

    videoGrid.classList.toggle(
        "layout-3x3",
        state.layout === 3
    );


    layout2x2Button.classList.toggle(
        "active",
        state.layout === 2
    );

    layout3x3Button.classList.toggle(
        "active",
        state.layout === 3
    );
}


/* =========================================================
   채팅 표시/숨김
========================================================= */

function applyChatVisibility() {

    chatPanel.classList.toggle(
        "hidden",
        !state.chatEnabled
    );


    toggleChatButton.classList.toggle(
        "active",
        state.chatEnabled
    );
}


/* =========================================================
   메인 방송 채팅
========================================================= */

function updateChat() {

    if (!state.chatEnabled) {
        return;
    }


    if (!state.mainChannelId) {

        chatEmpty.classList.remove("hidden");

        chatFrame.classList.add("hidden");

        chatFrame.src = "";

        chatTitle.textContent =
            "메인 방송 채팅";

        return;
    }


    const channel =
        state.channels.find(
            item => item.id === state.mainChannelId
        );


    if (!channel) {
        return;
    }


    chatTitle.textContent =
        `메인 방송 · ${channel.id}`;


    chatEmpty.classList.add("hidden");

    chatFrame.classList.remove("hidden");


    /*
     * 채팅 영역은 우선 CHZZK 라이브 페이지를 사용한다.
     *
     * 이후 Content Script에서
     * 채팅 영역만 남기는 방식으로 발전시킨다.
     */

    const newSrc =
        `https://chzzk.naver.com/live/${channel.id}`;


    if (chatFrame.src !== newSrc) {
        chatFrame.src = newSrc;
    }
}


/* =========================================================
   저장
========================================================= */

async function saveState() {

    try {

        await chrome.storage.local.set({
            [STORAGE_KEY]: {
                layout: state.layout,
                channels: state.channels.map(channel => ({
                    id: channel.id,
                    muted: channel.muted
                })),
                mainChannelId: state.mainChannelId,
                chatEnabled: state.chatEnabled
            }
        });

    } catch (error) {

        console.error(
            "상태 저장 실패:",
            error
        );
    }
}


/* =========================================================
   불러오기
========================================================= */

async function loadState() {

    try {

        const result =
            await chrome.storage.local.get(
                STORAGE_KEY
            );


        const saved = result[STORAGE_KEY];


        if (!saved) {
            return;
        }


        if (saved.layout === 2 ||
            saved.layout === 3) {

            state.layout = saved.layout;
        }


        if (Array.isArray(saved.channels)) {

            state.channels =
                saved.channels
                    .filter(channel =>
                        channel &&
                        typeof channel.id === "string"
                    )
                    .map(channel => ({
                        id: channel.id,
                        muted: Boolean(channel.muted)
                    }));
        }


        if (
            typeof saved.mainChannelId === "string" &&
            state.channels.some(
                channel =>
                    channel.id === saved.mainChannelId
            )
        ) {

            state.mainChannelId =
                saved.mainChannelId;

        } else if (state.channels.length > 0) {

            state.mainChannelId =
                state.channels[0].id;
        }


        if (typeof saved.chatEnabled === "boolean") {
            state.chatEnabled =
                saved.chatEnabled;
        }

    } catch (error) {

        console.error(
            "상태 불러오기 실패:",
            error
        );
    }
}