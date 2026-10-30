# 개발 및 빌드

Node.js 24 권장(최소 22). 저장소 루트에서 실행합니다.

```sh
npm ci
npm run verify       # 타입·빌드·단위·브라우저·백업·미디어·채팅 검사
npm run package
```

Chrome 확장 관리에서 **dist 폴더**를 압축 해제된 확장으로 로드합니다. 소스 폴더는 직접 로드하지 않습니다. 기존 설치를 업데이트할 때는 기존 설치 폴더에 ZIP 내용을 덮어쓰고 다시 로드해야 저장된 설정을 유지할 수 있습니다.

- `config/runtime.json`: 콘텐츠 프레임·멀티뷰·팝업의 스크립트 순서. 홈페이지 실행과 별도 페이지 실행에 같은 목록을 사용합니다.
- `src/viewer/template.ts`: 화면 마크업. 화면 상태와 이벤트는 viewer.js와 기능별 컨트롤러에서 관리합니다.
- `src/shared/runtime/scope.ts`: UI 수명에 속한 이벤트·감시자 해제. 스크린샷 갤러리·메인 화면·주요 채팅 패널에 적용합니다.
- `config/entries.json`: HTML·manifest 밖에서 동적으로 실행하는 스크립트와 Worker 진입점.
- `config/styles.json`: 기능별 CSS 조각을 합치는 순서. 출력 경로와 cascade를 유지합니다.
- `scripts/build.mjs`: Chrome 119 대상으로 진입점과 정적 importScripts 의존성만 배포합니다. ES import는 묶고 HTML·manifest를 생성하며 vendor 파일은 그대로 복사합니다.
- `config/testing.json` / `.test-build/`: 단위 검사에 필요한 모듈 export와 테스트 전용 별칭. dist와 ZIP에는 포함하지 않습니다.
- `scripts/verify.mjs`: 한 번 빌드한 산출물로 전체 검사를 순서대로 실행합니다. 녹화 인코더 검사를 병렬 실행하지 않습니다.
- `scripts/test.mjs`: 소스 대신 실제 dist 산출물을 검사합니다. `CHROMIUM_PATH`로 Chromium 실행 파일을 지정할 수 있습니다.
- `scripts/package.mjs`: dist만 ZIP으로 묶습니다. TS 원문·개발 의존성·소스맵은 포함하지 않습니다.

계획한 1~6단계의 코드 정리를 구현했습니다. 멀티뷰 내부 모듈은 ES import로 연결합니다. 콘텐츠 스크립트·팝업·저장소처럼 독립 실행 경계에서 필요한 기존 전역 API는 유지합니다. 공통 계약·세션·채팅 규칙·레이아웃 등에 TypeScript를 적용했으며 전체 JS 전환은 하지 않았습니다. 저장 키와 기존 기능을 유지하며, 전체 메모리 감소율은 측정하지 않았습니다.

브라우저 자동 검사는 모의 CHZZK 응답으로 수행합니다. 이 클라우드 Chromium은 확장 관리의 개발자 모드가 관리자 정책으로 제어되어 실제 MV3 등록 추가 검사를 완료하지 못했습니다. 로그인·실방송·DNR 적용·다른 확장과의 호환은 사용자 Chrome에서 확인해야 합니다.

## 실행 구조

`viewer.js`는 공통 상태·시작 흐름과 기능 조립을 담당합니다. `viewer/controllers`가 화면·즐겨찾기·방송 목록·음량 UI·세션을 맡으며, 플레이어·음량·채팅·싱크 제어는 각 모듈이 담당합니다. `src/viewer/styles`와 `src/popup/styles`의 CSS를 설정 순서대로 합쳐 기존 `viewer.css`·`popup.css` 경로에 출력합니다. 뒤쪽 덮어쓰기 규칙의 순서도 유지합니다. 일반 CHZZK 페이지에는 진입 버튼만 표시합니다. 버튼을 누르면 `site-viewer.js`가 최상위 프레임의 isolated world에 공용 UI 모듈을 주입합니다. 프레임 제어는 전용 확장 페이지 또는 같은 출처의 최상위 통합관제실 Shadow DOM에 속한 iframe에만 적용합니다. 페이지 모드의 녹화 Blob은 청크 메시지로 서비스 워커에 전달하여 확장 IndexedDB에 저장합니다.

확장 페이지에서 치지직 iframe을 열기 위해 `viewer-tabs.js`는 현재 전용 탭 ID, 확장 initiator, CHZZK 도메인, `sub_frame` 조건을 모두 충족하는 요청에만 CSP·X-Frame-Options 응답 헤더 예외를 적용합니다. 확장 페이지 자체 CSP는 로컬 스크립트와 CHZZK iframe만 허용합니다. 프레임 메시지는 origin과 실제 iframe 창을 함께 검증합니다. 채팅 DOM 정리는 부모에서 접근하지 않고 프레임 내부에서 수행합니다.

즐겨찾기·그룹·세션의 기존 저장소 키는 유지합니다. 전체 볼륨·메인 방송·레이아웃·채팅 위치·화면 잠금은 복원하고, 새 멀티뷰의 타일 음량은 10%·음소거로 초기화합니다. 이미 열린 멀티뷰의 목록 변경은 음량을 유지하며, 싱크 조정값은 현재 플레이어에서만 유지합니다.


### 실제 Chrome 확인 순서

1. 기존 설치 폴더에서 테스트 브랜치를 받고 빌드한 dist를 기존 설치 폴더에 반영한 뒤 확장을 다시 로드합니다. 일반 CHZZK 페이지에는 진입 버튼만 표시되고, 클릭 후 페이지 안에서 멀티뷰가 열리는지 확인합니다.
2. 팝업에서 방송 2개를 열어 주소가 `chrome-extension://…/src/viewer/viewer.html`인지, 방송·로그인·채팅이 정상인지 확인합니다.
3. 팝업의 새 탭·새 창 버튼으로 각각 반복해서 열 때 기존 멀티뷰와 별개로 새 탭·새 창이 생성되는지 확인합니다. 최신 창의 상태를 바꾼 뒤 이전 창을 조작·종료하고 다시 열어 최신 창의 방송·배치·전체 볼륨이 복원되는지 확인합니다.
4. 레이드·메인 방송·개별/전체 볼륨·음소거·채팅 위치·화면 잠금을 바꾸고 새로고침해 타일이 10%·음소거로 시작하고 나머지 설정은 복원되는지 확인합니다. 자동 재생이 브라우저에서 차단되면 플레이어를 눌러 재생합니다.
5. 치지직 플레이어에서 소리를 켠 뒤 다른 타일을 삭제하고, 남은 방송의 소리와 플레이어가 유지되는지 확인합니다.
6. 팔로잉 박스 위치·접기, 실제 로그인 계정의 팔로잉 전체 조회, 검색·온라인 표시를 확인합니다. 그룹 추가·편집에서 체크 선택과 그룹 순서를 확인합니다. 방송 이름이 채팅 시청자 이름으로 바뀌지 않는지, 기존 오염된 이름이 즐겨찾기 새로고침으로 복구되는지 확인합니다.
7. S 촬영·영역 자르기·복사·저장, R 녹화·결과 창의 형식/구간 저장·종료 시 임시 데이터 삭제를 확인합니다. 실제 방송의 음성 녹음과 브라우저별 MP4 지원도 확인합니다.
8. 라이브 싱크 ±0.1/±0.5초, 초기화, 다시보기 채팅, 즐겨찾기·그룹 동기화, 30초 상태 갱신을 확인합니다.

## 저장소와 배포 파일

GitHub main은 개발 소스입니다. `dist/`, `.test-build/`, `node_modules/`, `artifacts/`, 개인 `.backup` JSON은 Git에서 제외합니다. 설치용 ZIP은 `artifacts/CZ-Control-Room-v3.0.1.zip`에 생성하며 소스·검사·계측 자료를 포함하지 않습니다. GitHub Actions는 main에서 검사 후 ZIP artifact를 생성하고 설치 전용 release 브랜치를 갱신합니다. main과 release 두 브랜치를 유지합니다. GitHub Releases API로 Release를 등록하는 방식은 아닙니다. README의 직접 다운로드 링크는 release 브랜치의 설치 ZIP을 가리킵니다. release에는 SOURCE_COMMIT으로 빌드 기준 main 커밋을 기록합니다.

완료된 단계별 계획 문서와 이전 Python 패키징 진입점은 정리했습니다. 이전 문서는 Git 이력에 남아 있습니다. 검사·측정 스크립트, vendor 라이선스, 개인 백업은 유지합니다. 파일 수 감소를 실행 메모리 감소로 해석하지 않습니다.

## 수명과 호환 규칙

- UI의 ResourceScope가 listener·observer·timer·저장소 구독을 해제합니다. 기존 iframe을 재배치하지 않고 CSS로 위치를 바꿉니다.
- 채팅 표시 100개, 중복 식별 이력 2,048개를 유지합니다. 타임스탬프는 임시 보류·기본 OFF입니다. 켜면 MAIN-world 색인은 원본 연결에서 받은 fingerprint/시각만 각각 최대 2,048개 보관합니다. OFF 시 메시지 listener·시각 판독 observer와 색인을 해제합니다. 기존 연결을 다시 만들지 않고 토글할 수 있도록 document_start의 얇은 소켓 생성/종료 추적은 유지하며 데이터는 읽지 않습니다. 새 연결이나 송신은 하지 않습니다. 이름·본문이 같고 시각이 다른 메시지는 ID가 없으면 시각을 표시하지 않습니다.
- 채팅 문서의 MAIN-world WebSocket 생성 관찰은 document_start에서 설치합니다. 원본 객체·이벤트·송신을 유지하며 닫힌 연결의 listener를 제거합니다. 시작 전 메시지나 지원하지 않는 원본 포맷은 작성 시각을 얻지 못할 수 있습니다.
- 스크린샷은 동시 2개·보관 12개/128MiB, 녹화는 방송당 256MiB 한도입니다. URL·canvas·Worker를 종료 시 해제하고 원본 영상/음성 트랙은 stop하지 않습니다.
- 즐겨찾기는 그룹 없이도 유지됩니다. 기존 기본 그룹은 자동 삭제하지 않으며 사용자가 삭제/이름 변경할 수 있습니다. 명시적 빈 memberships는 백업·복원에서도 유지합니다.
- 통나무 수집 보조는 기본 OFF인 실험 기능입니다. 원본 채팅 유지에 따른 비용과 서비스 적립 조건은 [점검 안내](power-diagnostics.md), 장시간 측정은 [채팅 부하 점검](chat-performance.md)을 참고하세요.

이전 코드와 동일 화질·타일 수에서 30분 이상 시청, 타일/채팅 30회 열기·닫기, 캡처/녹화 반복 후 Chrome 작업 관리자와 힙 보유 경로를 비교합니다. 자동 검사의 합성 DOM·생성 영상은 실제 서비스의 로그인·보너스 지급이나 전체 메모리 감소율을 증명하지 않습니다.

## 로컬 폴더와 브랜치 정리

기존 프로젝트 경로에서 실행합니다. 기존 확장을 삭제하거나 새 경로에 다시 등록하지 마세요.

```sh
git switch main
git pull --ff-only --prune
npm ci
npm run build
npm run package
npm run clean -- --branches
```

`clean`은 `.test-build`와 artifacts 안의 구버전 CZ-Control-Room ZIP만 삭제합니다. 현재 버전 ZIP·dist·.backup·소스·node_modules와 알 수 없는 파일은 유지합니다. `--branches`는 main에 포함된 로컬 브랜치만 삭제하며 main/release/현재 브랜치를 제외합니다. 원격 브랜치를 삭제하는 명령은 아닙니다. 다음 테스트는 npm test가 필요한 테스트 산출물을 다시 생성합니다.

## 설치 파일 게시

검사를 마치고 main에 커밋·push한 뒤 `npm run publish:install`을 실행합니다. 기존 HTTPS Git 인증을 사용하며 API 토큰을 따로 읽지 않습니다. main 커밋의 깨끗한 소스로 재빌드하고 별도 임시 Git index에서 설치 트리를 만들어 release에 게시합니다. 기본 작업 트리·개인 백업은 변경하지 않습니다. 갱신 전 main 기준과 release의 기존 SHA를 확인해 오래된 배포가 덮어쓰지 않도록 합니다. `-- --dry-run`으로 원격 게시 없이 트리를 점검할 수 있습니다.

## 즐겨찾기 UI

`shared/favorite-item.js`와 `shared/favorite-item.css`를 팝업과 viewer에서 공용으로 사용합니다. CSS는 양쪽 산출물 마지막에 합칩니다. `name/title`은 기존 스트리머 이름이며 API의 방송 제목은 `liveTitle`로 분리합니다. 방송 종료 시 liveTitle은 비웁니다. 시청자 수 데이터는 유지하되 즐겨찾기 UI에서는 표시하지 않습니다. 오프라인은 이름·상태 한 줄이며, 온라인 제목·런타임은 같은 열에서 시작하는 11px 글씨입니다. 채팅 헤더 CSS와 자기 통나무 잔액 DOM 판독은 `content/chat/header-style.js`·`power-balance.js`에 분리합니다.

API 조사와 타임스탬프 참고 구현 비교: [chzzk-api-research.md](chzzk-api-research.md). 채팅 잔액 조회 수명 관리는 `src/content/chat/power-api.js`에서 담당합니다.
