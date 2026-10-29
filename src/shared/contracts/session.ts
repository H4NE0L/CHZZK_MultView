export type Layout = 'grid' | 'main-sub';
export interface ParsedChannel {type: 'live' | 'video'; id: string; uid: string; url: string}
export interface SessionChannel extends Record<string, unknown> {
  uid: string; type: 'live' | 'video'; sourceId: string; url: string;
  volume: number; muted: boolean;
}
export interface ViewerSession {
  channels: SessionChannel[]; selectedUid: string | null; layout: Layout;
  chatOpen: boolean; screenLocked: boolean; mainOnly: boolean;
  masterVolume: number; chatSide: 'left' | 'right'; shortcutsEnabled: boolean;
}
