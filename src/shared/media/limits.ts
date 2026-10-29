/** Application-owned media budgets; excludes source-player video decode/cache. */
export const MAX_SCREENSHOTS=12;
export const MAX_PENDING_SCREENSHOTS=2;
export const MAX_SCREENSHOT_BYTES=128*1024*1024;
export const MAX_RECORDING_BYTES=256*1024*1024;
// MediaRecorder can flush one final timeslice after crossing its stop threshold.
export const MAX_TRANSFER_BYTES=MAX_RECORDING_BYTES+16*1024*1024;
export const TRANSFER_IDLE_MS=120000;
export const DOWNLOAD_URL_MS=10000;
