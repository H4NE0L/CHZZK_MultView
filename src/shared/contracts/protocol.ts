import type {ChatMessage, ChatSettings} from './chat';
export interface ImportantChatBatch {
  source: 'chzzk-multiview'; type: 'IMPORTANT_CHAT_BATCH'; uid: string; messages: ChatMessage[];
}
export interface ImportantChatConfig {
  source: 'chzzk-multiview'; type: 'IMPORTANT_CHAT_CONFIG'; settings: ChatSettings; streamerName: string;
}
export interface VideoState {
  source: 'chzzk-multiview'; type: 'VIDEO_STATE'; uid: string;
  muted: boolean; volume: number; reason: 'player' | 'command';
}
/** Origin/window/type checks validate the envelope; payloads require their own validation. */
export interface PlayerEnvelope extends Record<string, unknown> {
  source: 'chzzk-multiview'; type: string; uid: string;
}
