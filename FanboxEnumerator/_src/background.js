// FanboxEnumerator/_src/background.js

chrome.runtime.onInstalled.addListener(() => {
  // Page State Matcher: Activates the extension on pixiv FANBOX relationship management pages
  const pageMatcher = new chrome.declarativeContent.PageStateMatcher({
    pageUrl: { hostSuffix: '.fanbox.cc', pathEquals: '/manage/relationships' },
  });

  // Remove any existing rules and add the new one
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [pageMatcher],
        actions: [new chrome.declarativeContent.ShowAction()],
      },
    ]);
  });
  console.log('[FanboxEnumerator] Background script initialized and page rules set.');
});
