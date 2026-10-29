"use strict";
(() => {
  // src/shared/settings-backup-client.ts
  async function request(type, document) {
    const result = await chrome.runtime.sendMessage({ type, document });
    if (!result?.ok) throw Error(result?.error || "설정 백업 응답을 확인할 수 없습니다.");
    return result;
  }
  var settingsBackupClient = Object.freeze({
    MAX_BYTES: 5 * 1024 * 1024,
    parse: (value) => CZSettingsBackup.parse(value),
    async create() {
      return CZSettingsBackup.parse((await request("SETTINGS_BACKUP_EXPORT")).document);
    },
    async previous() {
      const result = await request("SETTINGS_BACKUP_PREVIOUS");
      return result.document ? CZSettingsBackup.parse(result.document) : null;
    },
    async restore(value, _mode) {
      const document = CZSettingsBackup.parse(value);
      await request("SETTINGS_BACKUP_RESTORE", document);
      return { favorites: document.data.favorites.data.favorites };
    }
  });
  globalThis.CZSettingsBackupClient = settingsBackupClient;
})();
