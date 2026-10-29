/** Decode text explicitly so UTF-16 backups from Windows are not corrupted as UTF-8. */
export async function readJson(file: Blob): Promise<unknown> {
  const bytes=new Uint8Array(await file.arrayBuffer());
  const encoding=bytes[0]===0xff && bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe && bytes[1]===0xff?'utf-16be':'utf-8';
  let text: string;
  try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes).trim();}
  catch(_){throw Error('파일 인코딩을 읽을 수 없습니다. 메모장에서 UTF-8로 저장한 JSON 파일을 선택해주세요.');}
  if(!text)throw Error('백업 파일이 비어 있습니다.');
  if(text==='undefined')throw Error('파일에 undefined만 들어 있습니다. 백업 코드를 실행한 뒤 메모장에 Ctrl+V로 붙여넣어 저장해주세요.');
  try{return JSON.parse(text);}
  catch(error){throw Error('JSON 파일 문법을 읽을 수 없습니다. '+(error instanceof Error?error.message.slice(0,180):''));}
}
