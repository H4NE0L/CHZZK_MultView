# CHZZK API·타임스탬프 조사 (2026-10-30)

현재 코드, 사용자가 제공한 실제 응답, 공개 구현을 비교했습니다. 아래 service/polling 경로와 채팅 프로토콜은 공식 개발자 API의 안정성 보장이 확인된 계약이 아닌 웹 서비스 내부 구현입니다. 로그인한 실서비스에서의 최종 검증은 별도로 필요합니다.

| 이전 목표 | 확인한 근거 | 활용 범위·남은 점 |
| --- | --- | --- |
| 채팅 헤더 통나무 잔액 | 사용자 확인 GET `/service/v1/channels/{channelId}/log-power`, `content.amount` | 현재 채팅 채널을 30초 간격 조회하도록 연결. channelId·active·정수 amount 검증. 실패하면 프로필/마지막 확인 값/— 표시. |
| 모든 타일 자동 적립 | 사용자 자료 `/polling/v1/watch-event/live` 204 | 요청 성공만으로 지급을 증명하지 못함. 원본 시청 세션 유지와 채널별 잔액 변화를 비교해야 함. 호출을 임의 복제하거나 집중 상태를 위조하지 않음. |
| 통나무 보너스 수령 | 잔액 응답 `claims: []` | 비어 있는 배열로 수령 API·조건·본문을 알 수 없음. 보너스가 있는 상태의 조회 응답과 원본 받기 동작의 URL/메서드/응답이 필요. 현재 구현은 네이티브 버튼 보조 수준이며 전체 채널 수령 보장 없음. |
| 실제 작성 시각 | 채팅 WebSocket의 `msgTime`/`messageTime`, 참고 확장의 `createTime` | DOM에 없어도 원본 수신 메시지에서 읽을 수 있음. 문자열 bdy와 createTime 지원 보완. 원본 시각 없으면 현재 시각으로 대체하지 않음. |
| 닉네임·역할·본문 오인식 감소 | 공개 클라이언트의 profile·extras·msg/content 파싱 | 구조화된 데이터가 DOM 장식보다 유리. 전체 수집기를 교체하기 전 역할/이모티콘/중복 ID의 실응답 검증 필요. 이번에는 타임스탬프만 보완. |
| 방송인명·방송제목 혼동 | 현재 사용 중 채널 조회 `/service/v1/channels/{id}`, 방송 조회 `/service/v3.3/channels/{id}/live-detail` | 채널명과 liveTitle을 별도로 유지. 방송 제목이 즐겨찾기의 방송인명을 덮지 않도록 분리. |
| 팔로잉 목록 | 현재 사용 중 `/service/v1/channels/followings` | 이미 API 사용 중. 별도 새 API를 찾는 것보다 페이지 처리·로그인 실패 처리 유지가 우선. |
| 녹화 끊김·빠른 구간 저장 | 이번 조사 자료에서 관련 서버 API 확인 못 함 | 로컬 캡처·인코딩·컨테이너 편집 문제로 따로 다뤄야 함. API 하나로 해결된다고 볼 근거 없음. |
| 타 확장프로그램 호환 | 타 확장의 콘텐츠 스크립트 주입 조건 | API보다 URL·프레임·DOM 구조 문제. 원본 치지직 페이지 모드 유지가 현실적인 경로. |

## 참고 타임스탬프 확장 비교

[huntmori/chzzk-timestamp](https://github.com/huntmori/chzzk-timestamp/tree/0bd7356d2c80d3df18a2d1f18720f56613ce60e3)의 `src/injector/injector.js`와 `src/content/content.js`를 읽었습니다.

- document_start의 MAIN 월드에서 기존 WebSocket을 관찰하고 실시간 배열, 최근 메시지 messageList, 문자열 bdy를 해석합니다. messageTime/createTime을 사용합니다.
- DOM에서는 닉네임별 FIFO 큐로 시간을 소비합니다. 원본 시각을 찾지 못하면 현재 시각을 표시하고, 500ms마다 전체 후보를 재검사합니다.
- 현재 프로젝트는 이미 기존 소켓 관찰과 원본 시각 색인을 갖추고 있습니다. 이번에는 빠져 있던 문자열 bdy와 createTime을 독립적으로 보완했습니다. 이름+내용과 가능한 메시지 ID로 대조하며, 서로 다른 시각의 같은 내용은 ID 없이 추측하지 않습니다.
- 스크롤 재마운트에도 같은 원본 시각을 재사용합니다. 현재 시각 대체·닉네임 FIFO·500ms 전체 재검사는 도입하지 않습니다. 타임스탬프 기본 OFF, 색인 최대 2,048개, OFF/종료 시 정리는 유지합니다.
- 참고 저장소에서 재사용 허가를 명시한 LICENSE를 찾지 못해 소스 코드를 복사하거나 의존성으로 포함하지 않았습니다.

추가 비교: [kimcore/chzzk](https://github.com/kimcore/chzzk/tree/9208ad6901242c2854c44d6b13e219d7d023239d)의 `src/chat/chat.ts`는 최근/실시간 메시지와 msgTime/messageTime 처리를 보여 줍니다. 이 자료에서 통나무 수령 API는 확인하지 못했습니다.

로그인 쿠키·토큰을 내보내거나 저장할 필요는 없습니다. 추가 점검 자료는 인증 헤더를 제외한 URL·메서드·필요한 응답 필드만으로 충분합니다.
