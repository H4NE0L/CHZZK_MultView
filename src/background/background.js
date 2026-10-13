importScripts("../shared/session-store.js", "viewer-tabs.js");

/*
 * 치지직 통합관제실 — Naver 로그인 쿠키 연동
 * 확장 origin을 사용해 NID_AUT/NID_SES를 파티션 쿠키로 복제합니다.
 * 전용 확장 페이지 안의 CHZZK 프레임 로그인 환경을 보완합니다.
 */

const COOKIE_DEFS = [
  {
    name: "NID_AUT",
    domain: ".naver.com",
    url: "https://nid.naver.com/nidlogin.login"
  },
  {
    name: "NID_SES",
    domain: ".naver.com",
    url: "https://nid.naver.com/nidlogin.login"
  }
];

let bridgeRunning = false;

function extensionPartitionKey() {
  return {
    topLevelSite: `chrome-extension://${chrome.runtime.id}`
  };
}

function isTargetCookie(cookie) {
  return !!cookie &&
    COOKIE_DEFS.some(
      d => d.name === cookie.name && d.domain === cookie.domain
    );
}

function cookieDef(cookie) {
  return COOKIE_DEFS.find(
    d => d.name === cookie.name && d.domain === cookie.domain
  );
}

async function mirrorCookie(cookie, def) {
  if (!cookie || !def) return;
  if (cookie.partitionKey) return;

  // Chrome returns several read-only fields that should not be passed back
  // to chrome.cookies.set().
  const mutable = { ...cookie };
  delete mutable.hostOnly;
  delete mutable.session;
  delete mutable.firstPartyDomain;
  delete mutable.partitionKey;
  delete mutable.storeId;

  try {
    await chrome.cookies.set({
      ...mutable,
      url: def.url,
      secure: true,
      sameSite: "no_restriction",
      partitionKey: extensionPartitionKey()
    });
  } catch (err) {
    console.warn("[치지직 통합관제실] partition cookie mirror failed:", err);
  }
}

async function seedCookieBridge() {
  for (const def of COOKIE_DEFS) {
    try {
      const base = await chrome.cookies.get({
        name: def.name,
        url: def.url
      });

      if (base) {
        await mirrorCookie(base, def);
      }
    } catch (err) {
      console.warn("[치지직 통합관제실] cookie seed failed:", err);
    }
  }
}

async function initCookieBridge() {
  if (bridgeRunning) return;
  bridgeRunning = true;

  try {
    await seedCookieBridge();
  } finally {
    bridgeRunning = false;
  }
}

chrome.cookies.onChanged.addListener(async changeInfo => {
  if (changeInfo.removed) return;
  if (!isTargetCookie(changeInfo.cookie)) return;

  const def = cookieDef(changeInfo.cookie);
  await mirrorCookie(changeInfo.cookie, def);
});

chrome.runtime.onInstalled.addListener(() => {
  initCookieBridge().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  initCookieBridge().catch(console.error);
});



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === 'OPEN_MULTIVIEW_FROM_POPUP') {
    initCookieBridge().then(() => CZViewerTabs.open(message.initialInputs)).then(sendResponse).catch(error => sendResponse({ok: false, error: String(error)}));
    return true;
  }
  if (message?.type === 'COOKIE_BRIDGE_INIT') {
    initCookieBridge().then(() => sendResponse({ok: true})).catch(error => sendResponse({ok: false, error: String(error)}));
    return true;
  }
});
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url) CZViewerTabs.refreshRules().catch(console.error); });
chrome.tabs.onRemoved.addListener(() => CZViewerTabs.refreshRules().catch(console.error));
chrome.runtime.onStartup.addListener(() => CZViewerTabs.refreshRules().catch(console.error));
CZViewerTabs.refreshRules().catch(console.error);
