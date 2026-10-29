const fs=require('node:fs');
exports.executablePath=()=>process.env.CHROMIUM_PATH||(fs.existsSync('/usr/lib/chromium/chromium')?'/usr/lib/chromium/chromium':undefined);
