globalThis.CZViewerTabs = (() => {
  const RULE_ID = 20001;
  const pageURL = () => chrome.runtime.getURL('src/viewer/viewer.html');
  let queue = Promise.resolve();
  function serialized(task) {
    const result = queue.catch(() => {}).then(task);
    queue = result;
    return result;
  }
  async function viewerTabs() {
    const url = pageURL();
    return (await chrome.tabs.query({})).filter(tab => (tab.pendingUrl || tab.url)?.split(/[?#]/, 1)[0] === url);
  }
  async function configureRules(tabIds) {
    // CHZZK restricts frame-ancestors to Naver. Relax only the response headers
    // of CHZZK subframes in our dedicated tabs, never normal CHZZK tabs or APIs.
    const addRules = tabIds.length ? [{id: RULE_ID, priority: 1,
      action: {type: 'modifyHeaders', responseHeaders: [
        {header: 'content-security-policy', operation: 'remove'},
        {header: 'x-frame-options', operation: 'remove'}]},
      condition: {initiatorDomains: [chrome.runtime.id], requestDomains: ['chzzk.naver.com'], resourceTypes: ['sub_frame'], tabIds}
    }] : [];
    await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [RULE_ID], addRules});
  }
  function refreshRules() {
    return serialized(async () => configureRules((await viewerTabs()).map(tab => tab.id)));
  }
  function open(initialInputs) {
    return serialized(async () => {
      const inputs = [...new Set((Array.isArray(initialInputs) ? initialInputs : []).map(value => CZSessionStore.parseInput(value)?.url).filter(Boolean))];
      const tabs = await viewerTabs();
      let tab = tabs[0];
      if (tab) {
        await configureRules(tabs.map(t => t.id));
        if (inputs.length) {
          let response;
          try { response = await chrome.runtime.sendMessage({type: 'VIEWER_SET_INPUTS', tabId: tab.id, initialInputs: inputs}); } catch (_) {}
          if (!response?.ok) await chrome.tabs.update(tab.id, {url: `${pageURL()}?inputs=${encodeURIComponent(JSON.stringify(inputs))}`});
        }
        await chrome.tabs.update(tab.id, {active: true});
        if (tab.windowId != null) await chrome.windows.update(tab.windowId, {focused: true});
      } else {
        // Install the scoped rule before the extension page starts its frames.
        tab = await chrome.tabs.create({url: 'about:blank', active: true});
        try {
          await configureRules([tab.id]);
          await chrome.tabs.update(tab.id, {url: inputs.length ? `${pageURL()}?inputs=${encodeURIComponent(JSON.stringify(inputs))}` : pageURL()});
        } catch (error) {
          await chrome.tabs.remove(tab.id).catch(() => {});
          throw error;
        }
      }
      return {ok: true, tabId: tab.id, windowId: tab.windowId};
    });
  }
  return Object.freeze({open, refreshRules});
})();
