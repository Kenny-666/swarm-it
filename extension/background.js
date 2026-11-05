// Draftline: the toolbar button (or Alt+Shift+D) draws the current tab as a blueprint.
// Clicking again while it runs exits; draftline.js handles that toggle itself.

const TITLE = "Draftline (Alt+Shift+D)";

async function draft(tab) {
  if (!tab || tab.id == null) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["draftline.js"] });
  } catch (_) {
    // chrome:// pages, the Web Store and the PDF viewer can't be scripted
    const tabId = tab.id;
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#0B1D36" }).catch(() => {});
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ tabId, color: "#5FD3FF" }).catch(() => {});
    await chrome.action.setBadgeText({ tabId, text: "×" }).catch(() => {});
    await chrome.action.setTitle({ tabId, title: "Draftline can't draw this page" }).catch(() => {});
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
      chrome.action.setTitle({ tabId, title: TITLE }).catch(() => {});
    }, 2500);
  }
}

chrome.action.onClicked.addListener(draft);
