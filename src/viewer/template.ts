export const html = `
      <header class="mv-toolbar">
        <div class="toolbar-left">
          <details id="followingManager" class="favorite-manager"><summary>팔로잉</summary><div class="favorite-manager-panel"><div id="followingList"></div></div></details>
          <details id="favoriteManager" class="favorite-manager">
            <summary title="즐겨찾기 · 단축키 F" aria-keyshortcuts="F">즐겨찾기</summary>
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
                  <button id="syncLatestAll" type="button" class="manager-clear">전체 최신으로</button>
                  <button id="syncResetAll" type="button" class="manager-clear" disabled>전체 초기화</button>
                </div>
                <div id="syncSummaryList" class="sync-summary-list"></div>
              </div>
              <p class="volume-help">- 버튼은 방송을 뒤로 당기고(되감기, 지연 증가), + 버튼은 앞으로 밀어 라이브에 더 가깝게 합니다. 조정값은 저장되지 않으며 방송이 다시 로드되면 0으로 돌아갑니다.</p>
              <div id="syncList" class="sync-list"></div>
            </div>
          </details>
          <details id="volumeManager" class="volume-manager">
            <summary title="볼륨 조절 · 단축키 V" aria-keyshortcuts="V">볼륨</summary>
            <div class="volume-manager-panel">
              <div class="volume-row volume-master-row">
                <div class="master-volume-top">
                  <label for="masterVolume">전체 볼륨 <output id="masterVolumeValue">100%</output></label>
                </div>
                <div class="volume-slider-line"><button type="button" id="masterMuteBtn" class="tile-mute-btn" title="전체 음소거"></button><input id="masterVolume" type="range" min="0" max="100" value="100" step="1"></div>
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
            <button type="button" class="layout-toggle-btn" data-layout="grid" title="그리드 배치 · 단축키 G" aria-keyshortcuts="G">그리드</button>
            <button type="button" class="layout-toggle-btn" data-layout="main-sub" title="레이드 배치 · 단축키 G" aria-keyshortcuts="G">레이드</button>
          </div>
          <button id="chatSideBtn" class="icon-btn" type="button"></button>
          <button id="chatToggleBtn" title="채팅 닫기/열기 · 단축키 C" aria-keyshortcuts="C">채팅 닫기</button>
          <details id="settingsManager" class="viewer-settings">
            <summary title="설정">⚙ 설정</summary>
            <div class="settings-panel"><strong>설정</strong>
              <div class="settings-feature"><button id="settingsBackupBtn" type="button">설정 내보내기 / 불러오기</button><p>즐겨찾기와 멀티뷰 설정을 JSON 파일로 보관하거나 복원합니다.</p></div>
              <div class="settings-category-tabs" role="tablist" aria-label="설정 분야">
                <button type="button" role="tab" id="settingsConvenienceTab" data-settings-tab="convenience" aria-controls="settingsConveniencePanel" aria-selected="true">편의기능</button>
                <button type="button" role="tab" id="settingsMultiviewTab" data-settings-tab="multiview" aria-controls="settingsMultiviewPanel" aria-selected="false" tabindex="-1">멀티뷰</button>
                <button type="button" role="tab" id="settingsPlayerTab" data-settings-tab="player" aria-controls="settingsPlayerPanel" aria-selected="false" tabindex="-1">플레이어</button>
                <button type="button" role="tab" id="settingsChatTab" data-settings-tab="chat" aria-controls="settingsChatPanel" aria-selected="false" tabindex="-1">채팅</button>
              </div>
              <section id="settingsConveniencePanel" role="tabpanel" aria-labelledby="settingsConvenienceTab" data-settings-panel="convenience">              <div class="settings-feature">
                <label class="settings-option"><span>통나무 수집 보조 <span class="settings-experimental">(실험)</span></span><span class="settings-switch"><input id="powerRewardsEnabled" type="checkbox" role="switch" aria-label="통나무 수집 보조" aria-describedby="powerRewardsDescription"><span class="settings-switch-track" aria-hidden="true"></span></span></label>
                <p id="powerRewardsDescription">각 라이브 타일에 실제로 존재하는 통나무 보너스 받기 버튼을 자동 클릭합니다. 화면 모드는 변경하지 않습니다. 실제 적립·수령은 치지직 조건과 버튼 제공 여부에 따릅니다. 기본 OFF입니다.</p>
              </div>
              <div class="settings-debug-panel"><button id="powerDiagnosticsBtn" type="button">통나무 파워 점검</button></div>

              </section>
              <section id="settingsMultiviewPanel" role="tabpanel" aria-labelledby="settingsMultiviewTab" data-settings-panel="multiview" hidden>                <div class="settings-feature">
                <label class="settings-option"><span>멀티뷰 단축키 사용</span><span class="settings-switch"><input id="shortcutsEnabled" type="checkbox" role="switch" aria-label="멀티뷰 단축키 사용" aria-describedby="shortcutsDescription"><span class="settings-switch-track" aria-hidden="true"></span></span></label>
                <p id="shortcutsDescription">즐겨찾기·화면 잠금·상단바·소리·배치·채팅 및 방향키 단축키를 켜거나 끕니다. 스크린샷 S와 녹화 R은 항상 사용할 수 있습니다.</p>
              </div><div class="settings-feature"><button id="settingsLayoutBtn" type="button">그리드 / 레이드 전환</button><p>현재 방송 목록과 음량을 유지하며 배치를 전환합니다.</p></div><div class="settings-feature"><button id="settingsScreenLockBtn" type="button">플레이어 조작 잠금 전환</button><p>플레이어의 클릭 조작을 잠그거나 해제합니다.</p></div></section>
              <section id="settingsPlayerPanel" role="tabpanel" aria-labelledby="settingsPlayerTab" data-settings-panel="player" hidden><div class="settings-feature"><label class="settings-option"><span>되감기 바 표시</span><span class="settings-switch"><input id="rewindBarEnabled" type="checkbox" role="switch" aria-label="되감기 바 표시"><span class="settings-switch-track" aria-hidden="true"></span></span></label><p>멀티뷰의 방송 재생 위치 조절 바를 표시합니다. 방향키와 싱크 조절은 유지됩니다.</p></div><div class="settings-feature"><label class="settings-option"><span>자동 넓은 화면</span><span class="settings-switch"><input id="autoWideEnabled" type="checkbox" role="switch" aria-label="자동 넓은 화면"><span class="settings-switch-track" aria-hidden="true"></span></span></label><p>라이브·다시보기 진입 시 넓은 화면을 자동 적용합니다. 끄면 현재 화면 모드를 강제로 바꾸지 않습니다.</p></div>
                <div class="settings-feature">
                <label class="settings-option" for="recordingProfile"><span>녹화 품질</span><select id="recordingProfile"><option value="balanced">저부하 · 최대 720p / 30fps</option><option value="original">원본 해상도 / 프레임</option></select></label>
                <p>저부하 모드는 녹화 인코딩 부담을 줄입니다. 설정은 다음 녹화부터 적용됩니다.</p>
              </div>
<div class="settings-feature media-filename-settings">
                <label for="screenshotNameFormat">스크린샷 파일명 형식</label><input id="screenshotNameFormat" type="text" maxlength="200" spellcheck="false" aria-describedby="mediaNameFormatHelp screenshotNamePreview"><output id="screenshotNamePreview"></output>
                <label for="recordingNameFormat">영상 파일명 형식</label><input id="recordingNameFormat" type="text" maxlength="200" spellcheck="false" aria-describedby="mediaNameFormatHelp recordingNamePreview"><output id="recordingNamePreview"></output>
                <p id="mediaNameFormatHelp">{channel} 방송인 · {title} 방송 제목 · {uid} 방송 ID · {date} 날짜 · {time} 시각. 개별 날짜·시각: {YYYY} {YY} {MM} {DD} {HH} {mm} {ss}. PC의 현지 시각을 사용하고 확장자는 자동으로 붙입니다. 다음 촬영·녹화부터 적용됩니다.</p>
                <button id="resetMediaNameFormats" type="button">파일명 형식 기본값 복원</button>
              </div>
</section>
              <section id="settingsChatPanel" role="tabpanel" aria-labelledby="settingsChatTab" data-settings-panel="chat" hidden>
                <div class="settings-feature">
                <div class="settings-option"><label for="importantChatEnabled">채팅 모아보기 사용</label><div class="settings-option-actions"><label class="settings-switch"><input id="importantChatEnabled" type="checkbox" role="switch" aria-label="채팅 모아보기 사용" aria-describedby="importantChatDescription"><span class="settings-switch-track" aria-hidden="true"></span></label></div></div>
                <p id="importantChatDescription">주요 사용자의 채팅을 별도 영역에 모아 표시합니다.</p>
              </div>
                <div class="settings-feature"><label class="settings-option"><span>채팅창 펼치기</span><span class="settings-switch"><input id="settingsChatOpenEnabled" type="checkbox" role="switch" aria-label="채팅창 펼치기"><span class="settings-switch-track" aria-hidden="true"></span></span></label><p>끄면 채팅창을 접습니다. 상단 채팅 버튼과 같은 설정입니다.</p></div><div class="settings-feature"><label class="settings-option" for="settingsChatSide"><span>채팅창 위치</span><select id="settingsChatSide"><option value="left">왼쪽</option><option value="right">오른쪽</option></select></label></div><div class="settings-feature"><button id="openChatSettingsBtn" type="button">채팅 세부 설정</button><p>기본 채팅의 배지·타임스탬프와 모아보기 수집 설정을 관리합니다.</p></div></section>
            </div>
          </details>
        </div>
      </header>

      <div id="centerControls" class="center-controls">
        <button id="screenLockBtn" class="center-btn" type="button" title="플레이어 조작 잠금 · 단축키 H" aria-keyshortcuts="H">화면 잠금</button>
        <button id="collapseBtn" class="center-btn center-collapse" type="button" title="멀티뷰 메뉴 접기 · 단축키 B" aria-keyshortcuts="B" aria-label="멀티뷰 메뉴 접기"></button>
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
