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
