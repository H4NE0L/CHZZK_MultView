export {};
declare global {
  var CZImportantChat: typeof import('../shared/important-chat').importantChat;
}
declare global {
  var CZSessionStore: typeof import('../shared/session-store').sessionStore;
}
declare global {
  var CZMessages: typeof import('../shared/messages').messages;
}
declare global {
  var CZFavoritesBackup: typeof import('../shared/favorites-backup').favoritesBackup;
}
declare global {
  var CZFavoritesBackupUI: typeof import('../shared/favorites-backup-ui').favoritesBackupUI;
}
declare global {
  var CZSettingsBackup: typeof import('../shared/settings-backup').settingsBackup;
  var CZSettingsBackupClient: typeof import('../shared/settings-backup-client').settingsBackupClient;
}
