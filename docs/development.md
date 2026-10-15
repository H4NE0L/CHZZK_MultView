# 개발 안내

아래 명령은 저장소 루트에서 실행합니다.

## 프로젝트 구조

```text
manifest.json
src/
  background/  background.js, viewer-tabs.js, recording-results.js
  popup/       popup.html, popup.css, popup.js
  viewer/      viewer.html, viewer.js, viewer.css, page.css
               players.js, audio.js, chat.js, sync.js
               media-tools.js, screenshot-crop.js, recording.html, recording.js, recording.css
  content/     chzzk-frame.js, chat-layout.js, media-frame.js
  shared/      chzzk-api.js, favorites-store.js, session-store.js, messages.js
               followings-store.js, group-manager.js, group-manager.css, recordings-store.js
assets/icons/
docs/          media-features-plan.md
tests/
scripts/package.py
```

`viewer.js`는 화면 초기화·레이아웃·즐겨찾기 UI를 연결하며, 플레이어·음량·채팅·싱크 제어는 각 모듈이 담당합니다. `viewer.css`는 기존 Shadow DOM 스타일을 보존하는 별도 파일입니다. 일반 CHZZK 페이지에는 진입 버튼만 표시합니다. 버튼을 누르면 `site-viewer.js`가 최상위 프레임의 isolated world에 공용 UI 모듈을 주입합니다. 프레임 제어는 전용 확장 페이지 또는 같은 출처의 최상위 통합관제실 Shadow DOM에 속한 iframe에만 적용합니다. 페이지 모드의 녹화 Blob은 청크 메시지로 서비스 워커에 전달하여 확장 IndexedDB에 저장합니다.

확장 페이지에서 치지직 iframe을 열기 위해 `viewer-tabs.js`는 현재 전용 탭 ID, 확장 initiator, CHZZK 도메인, `sub_frame` 조건을 모두 충족하는 요청에만 CSP·X-Frame-Options 응답 헤더 예외를 적용합니다. 확장 페이지 자체 CSP는 로컬 스크립트와 CHZZK iframe만 허용합니다. 프레임 메시지는 origin과 실제 iframe 창을 함께 검증합니다. 채팅 DOM 정리는 부모에서 접근하지 않고 프레임 내부에서 수행합니다.

즐겨찾기·그룹·세션의 기존 저장소 키는 유지합니다. 전체 볼륨·개별 음량·음소거·메인 방송·레이아웃·채팅 위치·화면 잠금은 복원하고, 싱크 조정값은 현재 플레이어에서만 유지합니다.

## 개발과 검증

저장소 폴더를 확장으로 로드해 개발합니다. 수정한 뒤 확장을 다시 로드하고 전용 멀티뷰 페이지를 새로고침하세요.

Node.js 18 이상에서 데이터·세션·메시지·전용 탭 관리 회귀 테스트를 실행합니다.

```sh
node --test tests/*.test.cjs
```

Playwright와 Chromium이 설치된 개발 환경에서는 브라우저 DOM 검사를 실행합니다. `CHROMIUM_PATH`로 Chromium 실행 파일을 지정할 수 있습니다.

```sh
node tests/browser-smoke.cjs
node tests/site-browser-smoke.cjs
```

브라우저 검사는 팝업과 멀티뷰의 양방향 동기화, 그룹 관리·즐겨찾기 변경, 그룹 순서·다중 소속, 팔로잉 조회·로그인 실패 처리, 빈 그룹 보존, 플레이어 프레임 유지와 싱크 UI를 확인합니다. Chrome API와 CHZZK 응답은 모의 구현이므로 실제 확장 등록·DNR 적용·로그인·방송 재생을 대신하지 않습니다.

배포 전 실제 브라우저에서 기존 데이터 복원, 두 화면 간 동기화, 방송·채팅, 메인 변경·레이드 뷰, 볼륨·음소거와 싱크 조정·초기화를 확인하세요.

### 실제 Chrome 확인 순서

1. 기존 설치 폴더에서 테스트 브랜치를 받고 확장을 다시 로드합니다. 일반 CHZZK 페이지에는 진입 버튼만 표시되고, 클릭 후 페이지 안에서 멀티뷰가 열리는지 확인합니다.
2. 팝업에서 방송 2개를 열어 주소가 `chrome-extension://…/src/viewer/viewer.html`인지, 방송·로그인·채팅이 정상인지 확인합니다.
3. 팝업을 다시 열어 멀티뷰 탭이 재사용되는지, 비어 있는 팝업 목록이 기존 방송을 지우지 않는지 확인합니다.
4. 레이드 뷰·메인 방송·개별/전체 볼륨·음소거·채팅 위치·화면 잠금을 바꾸고 새로고침해 복원을 확인합니다. 자동 재생이 브라우저에서 차단되면 플레이어를 눌러 재생합니다.
5. 치지직 플레이어에서 소리를 켠 뒤 다른 타일을 삭제하고, 남은 방송의 소리와 플레이어가 유지되는지 확인합니다.
6. 팔로잉 박스 위치·접기, 실제 로그인 계정의 팔로잉 전체 조회, 검색·온라인 표시를 확인합니다. 그룹 추가·편집에서 체크 선택과 그룹 순서를 확인합니다. 방송 이름이 채팅 시청자 이름으로 바뀌지 않는지, 기존 오염된 이름이 즐겨찾기 새로고침으로 복구되는지 확인합니다.
7. S 촬영·영역 자르기·복사·저장, R 녹화·결과 창의 형식/구간 저장·종료 시 임시 데이터 삭제를 확인합니다. 실제 방송의 음성 녹음과 브라우저별 MP4 지원도 확인합니다.
8. 라이브 싱크 ±0.1/±0.5초, 초기화, 다시보기 채팅, 즐겨찾기·그룹 동기화, 30초 상태 갱신을 확인합니다.

### 배포 ZIP 생성

빌드 도구 없이 Python 표준 라이브러리로 실행 파일·아이콘·문서만 묶습니다.

```sh
python3 scripts/package.py
```

생성물은 `dist/CZ-Control-Room-v2.0.1.zip`이며 `tests/`와 개발 도구는 포함하지 않습니다.

페이지 모드에서 기존 채팅 수집 확장의 방송 대상, 로그인, 실제 녹화 음성, 원본 페이지 복귀를 별도로 확인하세요. 모의 검사는 타사 확장의 동작을 검증하지 않습니다.
