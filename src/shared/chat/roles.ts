import type {ChatRole} from '../contracts/chat';
export const nameKey=(value: unknown)=>String(value||'').normalize('NFC').trim().toLocaleLowerCase('ko-KR');
  export function colorRole(color: unknown): ChatRole{
    const values=String(color).match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);if(!values)return '';
    const [r=0,g=0,b=0]=values.slice(1,4).map(value=>Number(value)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
    if(max<.5 || delta/max<.45)return '';
    let hue=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;hue=(hue*60+360)%360;
    if(hue>=20 && hue<=60)return 'streamer';
    if(hue>=190 && hue<=250)return 'manager';
    if(hue>=90 && hue<185)return 'partner';
    return '';
  }

export function evidence(raw: readonly unknown[],semantic: readonly unknown[]) {
      const values=raw.map(value=>String(value||'').normalize('NFC').trim().toLowerCase().replace(/(?:\s*(?:배지|아이콘)|\s+(?:badge|icon))$/,'').trim());
      const markers=semantic.map(value=>String(value||'').toLowerCase());
      let next: ChatRole='';
      if(values.some(v=>['스트리머','방송자','방송인','streamer','broadcaster','owner','streaming_channel_owner'].includes(v)) || markers.some(v=>!/(?:^|[._\s/#-])partner(?:$|[._\s/#-])/.test(v) && /(?:^|[._\s/#-])(?:streamer|broadcaster|streaming_channel_owner)(?:$|[._\s/#-])/.test(v)))next='streamer';
      else if(values.some(v=>['채널 관리자','채널관리자','채널 매니저','매니저','방송 관리자','관리자','manager','channel manager','channel_manager','streaming_channel_manager'].includes(v)) || markers.some(v=>/(?:^|[._\s/#-])(?:manager|channel_manager|streaming_channel_manager)(?:$|[._\s/#-])/.test(v)))next='manager';
      else if(values.some(v=>['파트너','파트너 스트리머','공식 파트너','partner','partner streamer','partner_streamer'].includes(v)) || markers.some(v=>/(?:^|[._\s/#-])partner(?:$|[._\s/#-])/.test(v)))next='partner';
  return {role:next,labels:values,markers};
}
export function strongest(current: ChatRole,next: ChatRole): ChatRole {
  const priority={'':0,streamer:3,manager:2,partner:1};return priority[next]>priority[current]?next:current;
}
