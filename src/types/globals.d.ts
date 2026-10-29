export {};
declare global {
  var CZRuntime: typeof import('../shared/runtime/scope').runtime;
  var CZViewerTemplate: typeof import('../viewer/template').template;
}
