interface ExportOptions {container: string;trim: boolean;start: number;end: number;transcode: boolean}
export function create(blob: Blob,options: ExportOptions,onProgress: (percent: number)=>void,factory=()=>new Worker(new URL('recording-export-worker.js',location.href),{type:'module'})) {
  const worker=factory();let settled=false;
  let resolveJob: (value: Blob | null)=>void=()=>{},rejectJob: (error: Error)=>void=()=>{};
  const result=new Promise<Blob | null>((resolve,reject)=>{resolveJob=resolve;rejectJob=reject;});
  function finish(value: Blob | null,error?: Error){
    if(settled)return;settled=true;
    worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();
    if(error)rejectJob(error);else resolveJob(value);
  }
  worker.onerror=()=>finish(null,Error('영상 데이터 처리 Worker를 실행하지 못했습니다.'));
  worker.onmessageerror=()=>finish(null,Error('영상 처리 응답을 읽지 못했습니다.'));
  worker.onmessage=({data})=>{
    if(settled)return;
    if(data?.type==='progress' && Number.isFinite(data.percent))onProgress(Math.max(0,Math.min(100,data.percent)));
    else if(data?.type==='error')finish(null,Error(String(data.error||'영상 처리 실패')));
    else if(data?.type==='done'){
      if(!(data.buffer instanceof ArrayBuffer) || !data.buffer.byteLength || !/^video\/(mp4|webm)$/.test(data.mime))finish(null,Error('유효하지 않은 영상 처리 결과입니다.'));
      else finish(new Blob([data.buffer],{type:data.mime}));
    }
  };
  try{worker.postMessage({blob,...options});}catch(error){finish(null,error instanceof Error?error:Error(String(error)));}
  return {result,cancel(){finish(null);}};
}
