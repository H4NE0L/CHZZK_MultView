let currentVideo = null;
let observer = null;


/* =========================================================
   Video 찾기
========================================================= */

function findVideo() {

    const videos =
        Array.from(
            document.querySelectorAll("video")
        );


    if (videos.length === 0) {
        return null;
    }


    /*
     * 실제 재생 중인 video를 우선
     */

    const playingVideo =
        videos.find(video =>
            !video.paused &&
            video.readyState >= 2
        );


    if (playingVideo) {
        return playingVideo;
    }


    return videos[0];
}


/* =========================================================
   Video 연결
========================================================= */

function connectVideo() {

    const video = findVideo();

    if (!video) {
        return;
    }


    if (currentVideo === video) {
        return;
    }


    currentVideo = video;


    /*
     * 상태 전달
     */

    sendVideoState();


    /*
     * video의 muted 상태가 변경되면
     * 부모에게 알려준다.
     */

    video.addEventListener(
        "volumechange",
        sendVideoState
    );
}


/* =========================================================
   부모에게 상태 전달
========================================================= */

function sendVideoState() {

    if (!currentVideo) {
        return;
    }


    window.parent.postMessage(
        {
            source: "chzzk-multiview",
            type: "VIDEO_STATE",
            muted: currentVideo.muted
        },
        "*"
    );
}


/* =========================================================
   부모 명령 수신
========================================================= */

window.addEventListener(
    "message",
    event => {

        if (!event.data) {
            return;
        }


        if (
            event.data.source !==
            "chzzk-multiview"
        ) {
            return;
        }


        if (
            event.data.type !==
            "SET_MUTED"
        ) {
            return;
        }


        const muted =
            Boolean(event.data.muted);


        connectVideo();


        if (!currentVideo) {
            return;
        }


        currentVideo.muted = muted;


        /*
         * 상태 즉시 전달
         */

        sendVideoState();
    }
);


/* =========================================================
   DOM 변경 감시
========================================================= */

observer =
    new MutationObserver(() => {

        connectVideo();

    });


observer.observe(
    document.documentElement,
    {
        childList: true,
        subtree: true
    }
);


/* =========================================================
   초기 탐색
========================================================= */

connectVideo();


/*
 * 플레이어가 늦게 만들어지는 경우 대비
 */

setTimeout(connectVideo, 1000);
setTimeout(connectVideo, 3000);
setTimeout(connectVideo, 5000);