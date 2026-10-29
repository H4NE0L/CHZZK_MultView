export {};
declare global {
  var CZRuntime: typeof import('../shared/runtime/scope').runtime;
  var CZViewerTemplate: typeof import('../viewer/template').template;
}
declare global {
  var CZImportantChat: typeof import('../shared/important-chat').importantChat;
}
declare global {
  var CZSessionStore: typeof import('../shared/session-store').sessionStore;
}
declare global {
  var CZLayout: typeof import('../viewer/layout').layout;
}
declare global {
  var CZMessages: typeof import('../shared/messages').messages;
}
declare global {
  var CZChatRenderer: typeof import('../viewer/chat-renderer').chatRenderer;
}
declare global {
  var CZViewerSettings: typeof import('../viewer/settings').settings;
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
declare global {
  var CZChatRoles: typeof import('../shared/chat/roles').roles;
  var CZChatHistory: typeof import('../shared/chat/history').history;
}
