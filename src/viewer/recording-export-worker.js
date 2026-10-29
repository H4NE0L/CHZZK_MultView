// src/viewer/recording-export-worker.js
import { Input, BlobSource, ALL_FORMATS, Output, BufferTarget, WebMOutputFormat, Mp4OutputFormat, Conversion } from "../vendor/mediabunny/mediabunny.min.mjs";
self.onmessage = async ({ data }) => {
  let input;
  try {
    input = new Input({ source: new BlobSource(data.blob), formats: ALL_FORMATS });
    const target = new BufferTarget(), output = new Output({ target, format: data.container === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat() });
    const conversion = await Conversion.init({ input, output, trim: data.trim ? { start: data.start, end: data.end } : void 0, copy: { mode: data.transcode ? "preferred" : "forced", shiftTolerance: Infinity, boundaryPolicy: "expand" }, showWarnings: false });
    if (!conversion.isValid || conversion.discardedTracks.length) throw Error(data.transcode ? "이 브라우저에서 선택한 영상·음성 코덱을 변환할 수 없습니다. 원본 형식으로 저장해주세요." : "이 코덱 조합은 재인코딩 없이 저장할 수 없습니다. 원본 형식으로 저장해주세요.");
    let last = -1;
    conversion.onProgress = (progress) => {
      const percent = Math.floor(progress * 100);
      if (percent !== last) {
        last = percent;
        self.postMessage({ type: "progress", percent });
      }
    };
    await conversion.execute();
    if (!target.buffer?.byteLength) throw Error("저장할 영상 데이터가 없습니다.");
    input.dispose();
    input = null;
    self.postMessage({ type: "done", buffer: target.buffer, mime: data.container === "mp4" ? "video/mp4" : "video/webm" }, [target.buffer]);
  } catch (error) {
    self.postMessage({ type: "error", error: error.message });
  } finally {
    input?.dispose();
  }
};
