export const html = `
      <header class="mv-toolbar">
        <div class="toolbar-left">
          <details id="followingManager" class="favorite-manager"><summary>팔로잉</summary><div class="favorite-manager-panel"><div id="followingList"></div></div></details>
          <details id="favoriteManager" class="favorite-manager">
            <summary>즐겨찾기</summary>
            <div class="favorite-manager-panel">
              <div class="favorite-manager-tools">
                <button id="favoriteManageGroups" type="button">그룹 관리</button>
                <button id="favoriteRefresh" type="button" title="온라인 상태 새로고침">↻</button>
              </div>
              <div id="favoriteList" class="favorite-list"></div>
            </div>
          </details>
          <div class="add-area">
            <input id="uidInput" placeholder="방송 URL 또는 UID">
            <button id="addBtn" class="accent">방송 추가</button>
          </div>
          <details id="channelManager" class="channel-manager">
            <summary>방송 목록</summary>
            <div class="channel-manager-panel">
              <div class="channel-manager-head"><strong>현재 방송</strong><button id="clearBtn" class="manager-clear">전체 삭제</button></div>
              <div id="channelList" class="channel-list"></div>
            </div>
          </details>
        </div>

        <div class="toolbar-center" aria-hidden="true"></div>

        <div class="toolbar-right">
          <details id="syncManager" class="volume-manager sync-manager">
            <summary>싱크<span id="syncBadge" class="sync-badge" hidden></span></summary>
            <div class="volume-manager-panel sync-panel">
              <div class="sync-summary">
                <div class="sync-summary-head">
                  <strong>싱크 조정 현황</strong>
                  <button id="syncResetAll" type="button" class="manager-clear" disabled>전체 초기화</button>
                </div>
                <div id="syncSummaryList" class="sync-summary-list"></div>
              </div>
              <p class="volume-help">- 버튼은 방송을 뒤로 당기고(되감기, 지연 증가), + 버튼은 앞으로 밀어 라이브에 더 가깝게 합니다. 조정값은 저장되지 않으며 방송이 다시 로드되면 0으로 돌아갑니다.</p>
              <div id="syncList" class="sync-list"></div>
            </div>
          </details>
          <details id="volumeManager" class="volume-manager">
            <summary>볼륨</summary>
            <div class="volume-manager-panel">
              <div class="volume-row volume-master-row">
                <div class="master-volume-top">
                  <button type="button" id="masterMuteBtn" class="tile-mute-btn" title="전체 음소거"></button>
                  <label for="masterVolume">전체 볼륨 <output id="masterVolumeValue">100%</output></label>
                </div>
                <input id="masterVolume" type="range" min="0" max="100" value="100" step="1">
                <p class="volume-help">확장프로그램 전체 음량입니다. 아래 방송별 볼륨에 곱해져 적용되며, 방송별 설정값은 바뀌지 않습니다.</p>
              </div>
              <label class="main-only-check" for="mainOnlyCheck">
                <input id="mainOnlyCheck" type="checkbox">
                <span class="main-only-text">
                  <strong>메인만 듣기</strong>
                  <small>체크하면 메인 방송의 소리만 재생하고 나머지 방송은 음소거합니다. 해제하면 각 방송이 기존 설정대로 돌아옵니다.</small>
                </span>
              </label>
              <div id="tileVolumeList" class="tile-volume-list"></div>
            </div>
          </details>
          <div id="layoutToggle" class="layout-toggle" role="group" aria-label="레이아웃">
            <button type="button" class="layout-toggle-btn" data-layout="grid">그리드</button>
            <button type="button" class="layout-toggle-btn" data-layout="main-sub">레이드 뷰</button>
          </div>
          <button id="chatSideBtn" class="icon-btn" type="button"></button>
          <button id="chatToggleBtn" title="채팅 닫기/열기 (C)">채팅 닫기</button>
          <details id="settingsManager" class="viewer-settings">
            <summary title="설정">⚙ 설정</summary>
            <div class="settings-panel"><strong>설정</strong>
              <div class="settings-feature">
                <label class="settings-option"><span>멀티뷰 단축키 사용</span><span class="settings-switch"><input id="shortcutsEnabled" type="checkbox" role="switch" aria-label="멀티뷰 단축키 사용" aria-describedby="shortcutsDescription"><span class="settings-switch-track" aria-hidden="true"></span></span></label>
                <p id="shortcutsDescription">즐겨찾기·화면 잠금·상단바·소리·배치·채팅 및 방향키 단축키를 켜거나 끕니다. 스크린샷 S와 녹화 R은 항상 사용할 수 있습니다.</p>
              </div>
              <div class="settings-feature">
                <div class="settings-option"><label for="importantChatEnabled">채팅 모아보기 사용</label><div class="settings-option-actions"><button id="importantChatSettings" class="settings-gear" type="button" title="수집 설정·점검" aria-label="수집 설정·점검"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m9 3-.5 2-2 1-2-.5-2 3 1.5 1.5v3L2.5 15l2 3 2-.5 2 1 .5 2h4l.5-2 2-1 2 .5 2-3-1.5-1.5v-3L20 9l-2-3-2 .5-2-1-.5-2Z"/><circle cx="11.5" cy="12" r="3"/></svg></button><label class="settings-switch"><input id="importantChatEnabled" type="checkbox" role="switch" aria-label="채팅 모아보기 사용" aria-describedby="importantChatDescription"><span class="settings-switch-track" aria-hidden="true"></span></label></div></div>
                <p id="importantChatDescription">주요 사용자의 채팅을 별도 영역에 모아 표시합니다.</p>
              </div>
              <div class="settings-feature">
                <label class="settings-option" for="recordingProfile"><span>녹화 품질</span><select id="recordingProfile"><option value="balanced">저부하 · 최대 720p / 30fps</option><option value="original">원본 해상도 / 프레임</option></select></label>
                <p>저부하 모드는 녹화 인코딩 부담을 줄입니다. 설정은 다음 녹화부터 적용됩니다.</p>
              </div>
              <div class="settings-debug-panel"><button id="powerDiagnosticsBtn" type="button">통나무 파워 점검</button></div>
            </div>
          </details>
        </div>
      </header>

      <div id="centerControls" class="center-controls">
        <button id="screenLockBtn" class="center-btn" type="button" title="플레이어 조작 잠금">화면 잠금</button>
        <button id="collapseBtn" class="center-btn center-collapse" type="button" title="멀티뷰 메뉴 접기" aria-label="멀티뷰 메뉴 접기"></button>
      </div>

      <section class="mv-body">
        <div id="videoGrid" class="video-grid"></div>

        <aside id="chatPanel" class="chat-panel">
          <div class="chat-frame-wrap">
            <div id="chatEmpty" class="chat-empty">
              메인 방송을 선택하면<br>실제 CHZZK 채팅을 불러옵니다.
            </div>
          </div>
        </aside>
      </section>
`;

export const template = Object.freeze({html});
globalThis.CZViewerTemplate = template;
