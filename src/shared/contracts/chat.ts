export type ChatRole = 'streamer' | 'manager' | 'partner' | '';
export interface ChatSettings {
  hideBadges: boolean; enabled: boolean; streamers: boolean; managers: boolean; partners: boolean;
  names: string[]; excludedNames: string[];
}
export type ChatSegment = {type: 'text'; text: string} | {type: 'image'; src: string; alt: string};
export interface BadgeSVG {viewBox: string;color: string;shapes: {tag: string;attrs: Record<string,string>}[]}
export interface ChatBadge {src: string;alt: string;svg?: BadgeSVG | null}
export interface ChatMessage {
  id: string; name: string; text: string; updateOnly: boolean;
  segments: ChatSegment[]; badges: ChatBadge[];
  badgesAfter: ChatBadge[]; nameColor: string; bodyColor: string;
  role: ChatRole; time: number | null;
}
