"use strict";
(() => {
  // src/shared/settings-backup.ts
  var PREVIOUS_KEY = "chzzkSettingsBeforeRestoreV1";
  var HEIGHT_KEY = "chzzkImportantChatHeightV1";
  var PROFILE_KEY = "chzzkRecordingProfileV1";
  var object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  function cleanSession(value) {
    const raw = object(value);
    if (!Array.isArray(raw.channels) || raw.channels.length > 200) throw Error("방송 목록 형식을 확인해주세요.");
    if (!["grid", "main-sub"].includes(String(raw.layout)) || !["left", "right"].includes(String(raw.chatSide))) throw Error("화면 배치 설정을 확인해주세요.");
    for (const key of ["chatOpen", "screenLocked", "mainOnly", "shortcutsEnabled"]) if (typeof raw[key] !== "boolean") throw Error("설정 ON/OFF 값을 확인해주세요.");
    if (typeof raw.masterVolume !== "number" || !Number.isFinite(raw.masterVolume) || raw.masterVolume < 0 || raw.masterVolume > 1) throw Error("전체 음량을 확인해주세요.");
    if (raw.powerRewards !== void 0 && typeof raw.powerRewards !== "boolean") throw Error("통나무 수집 설정을 확인해주세요.");
    if (raw.chatTimestamps !== void 0 && typeof raw.chatTimestamps !== "boolean") throw Error("타임스탬프 설정을 확인해주세요.");
    const channels = raw.channels.map((value2) => {
      const channel = object(value2);
      if (typeof channel.uid !== "string" || channel.uid.length > 160) throw Error("방송 ID를 확인해주세요.");
      const parsed = CZSessionStore.parseInput(channel.uid.startsWith("video:") ? `video/${channel.uid.slice(6)}` : channel.uid);
      if (!parsed || parsed.uid !== channel.uid) throw Error("방송 ID를 확인해주세요.");
      if (typeof channel.volume !== "number" || !Number.isFinite(channel.volume) || channel.volume < 0 || channel.volume > 1 || typeof channel.muted !== "boolean") throw Error("방송 음량을 확인해주세요.");
      const label = (value3) => typeof value3 === "string" ? value3.slice(0, 1e3) : "";
      return { uid: parsed.uid, url: parsed.url, type: parsed.type, sourceId: parsed.id, name: label(channel.name), title: label(channel.title), volume: channel.volume, muted: channel.muted };
    });
    return CZSessionStore.normalize({ ...raw, channels });
  }
  function parse(value) {
    const document = object(value), data = object(document.data);
    if (document.format !== "cz-control-room-settings" || document.version !== 1) throw Error("지원하는 설정 백업 파일이 아닙니다. 즐겨찾기 전용 파일은 그룹 관리에서 불러오세요.");
    const chat = object(data.chat);
    for (const key of ["enabled", "streamers", "managers", "partners"]) if (typeof chat[key] !== "boolean") throw Error("채팅 수집 설정을 확인해주세요.");
    for (const key of ["names", "excludedNames"]) if (!Array.isArray(chat[key]) || chat[key].length > 50 || chat[key].some((item) => typeof item !== "string" || item.length > 40)) throw Error("채팅 사용자 목록을 확인해주세요.");
    if (typeof data.chatHeight !== "number" || !Number.isFinite(data.chatHeight) || data.chatHeight < 64 || data.chatHeight > 1600) throw Error("채팅 영역 높이를 확인해주세요.");
    if (data.recordingProfile !== "balanced" && data.recordingProfile !== "original") throw Error("녹화 품질을 확인해주세요.");
    return { format: "cz-control-room-settings", version: 1, exportedAt: typeof document.exportedAt === "string" ? document.exportedAt.slice(0, 80) : (/* @__PURE__ */ new Date()).toISOString(), data: {
      favorites: CZFavoritesBackup.parse(data.favorites),
      session: cleanSession(data.session),
      chat: CZImportantChat.settings(chat),
      chatHeight: data.chatHeight,
      recordingProfile: data.recordingProfile
    } };
  }
  async function create() {
    const values = await chrome.storage.local.get([CZSessionStore.KEY, CZImportantChat.KEY, HEIGHT_KEY, PROFILE_KEY]);
    const height = Number(values[HEIGHT_KEY]);
    return parse({ format: "cz-control-room-settings", version: 1, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), data: {
      favorites: await CZFavoritesBackup.create(),
      session: CZSessionStore.normalize(values[CZSessionStore.KEY]),
      chat: CZImportantChat.settings(values[CZImportantChat.KEY]),
      chatHeight: Number.isFinite(height) && height >= 64 && height <= 1600 ? height : 200,
      recordingProfile: values[PROFILE_KEY] === "original" ? "original" : "balanced"
    } });
  }
  function payload(value) {
    const { data } = parse(value);
    return {
      chzzkMultiviewFavoritesV08: data.favorites.data.favorites,
      chzzkMultiviewFavoriteGroupsV02: data.favorites.data.groups,
      chzzkFavoriteGroupOptionsV2: data.favorites.data.groupOptions,
      [CZSessionStore.KEY]: data.session,
      [CZImportantChat.KEY]: data.chat,
      [HEIGHT_KEY]: data.chatHeight,
      [PROFILE_KEY]: data.recordingProfile
    };
  }
  async function previous() {
    const values = await chrome.storage.local.get(PREVIOUS_KEY);
    return values[PREVIOUS_KEY] ? parse(values[PREVIOUS_KEY]) : null;
  }
  var settingsBackup = Object.freeze({ parse, create, payload, previous, PREVIOUS_KEY, MAX_BYTES: 5 * 1024 * 1024 });
  globalThis.CZSettingsBackup = settingsBackup;
})();
