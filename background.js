/*
 * CHZZK MultiView v0.4
 * Cookie bridge
 *
 * The uploaded reference implementation mirrors NID_AUT/NID_SES into
 * partitioned storage. We keep the same core idea, but use the extension
 * origin dynamically instead of hard-coding another viewer's domain.
 *
 * The main v0.4 UI is opened on a top-level CHZZK page, so this bridge is
 * a compatibility layer rather than the only authentication mechanism.
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
    console.warn("[CHZZK MultiView] partition cookie mirror failed:", err);
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
      console.warn("[CHZZK MultiView] cookie seed failed:", err);
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


async function sendOpenMultiView(tabId, inputs) {
  try {
    const result = await chrome.tabs.sendMessage(tabId, {
      type: "OPEN_MULTIVIEW",
      initialInputs: inputs
    });
    return result?.ok !== false;
  } catch (_) {
    return false;
  }
}

async function ensurePageContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ["chzzk-page.js"]
    });
    return true;
  } catch (err) {
    console.warn("[CHZZK MultiView] page content script injection failed:", err);
    return false;
  }
}

async function openMultiViewFromPopup(initialInputs) {
  const inputs = Array.isArray(initialInputs) ? initialInputs.filter(Boolean) : [];

  // Always create a new tab for MultiView.
  // Never reuse the popup's current tab or an existing CHZZK broadcast tab:
  // doing so would replace the user's normal CHZZK page with the MultiView UI.
  let targetTab;
  try {
    targetTab = await chrome.tabs.create({
      url: "https://chzzk.naver.com/",
      active: true
    });
  } catch (err) {
    console.error("[CHZZK MultiView] failed to create tab:", err);
    return { ok: false, error: "TAB_CREATE_FAILED" };
  }

  const tabId = targetTab?.id;
  if (!tabId) return { ok: false, error: "NO_TAB" };

  // Wait for the new CHZZK page's content script. If declarative injection
  // is delayed, use the scripting fallback after the page has started loading.
  for (let i = 0; i < 120; i++) {
    if (await sendOpenMultiView(tabId, inputs)) {
      await chrome.tabs.update(tabId, { active: true }).catch(() => {});
      return { ok: true, tabId, windowId: targetTab.windowId };
    }

    if (i === 8 || i === 20 || i === 40) {
      await ensurePageContentScript(tabId);
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  // Do not leave a blank helper tab behind on failure.
  try { await chrome.tabs.remove(tabId); } catch (_) {}
  return { ok: false, error: "CONTENT_SCRIPT_TIMEOUT" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "OPEN_MULTIVIEW_FROM_POPUP") {
    openMultiViewFromPopup(message.initialInputs)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "COOKIE_BRIDGE_INIT") {
    initCookieBridge()
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "COOKIE_BRIDGE_STATUS") {
    sendResponse({
      ok: true,
      extensionPartitionKey: extensionPartitionKey()
    });
  }
});
