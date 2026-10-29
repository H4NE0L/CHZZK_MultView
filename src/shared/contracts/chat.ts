export type ChatRole = 'streamer' | 'manager' | 'partner' | '';
export interface ChatSettings {
  enabled: boolean; streamers: boolean; managers: boolean; partners: boolean;
  names: string[]; excludedNames: string[];
}
export type ChatSegment = {type: 'text'; text: string} | {type: 'image'; src: string; alt: string};
export interface ChatMessage {
  id: string; name: string; text: string; updateOnly: boolean;
  segments: ChatSegment[]; badges: {src: string; alt: string}[];
  role: ChatRole; time: number | null;
}
