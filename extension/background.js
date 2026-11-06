// Swarmline: the toolbar button (or Alt+Shift+L) lets the swarm build the current tab.
// Clicking again while it runs exits; swarmline.js handles that toggle itself.

const TITLE = "Swarmline (Alt+Shift+L)";

async function build(tab) {
  if (!tab || tab.id == null) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["swarmline.js"] });
  } catch (_) {
    // chrome:// pages, the Web Store and the PDF viewer can't be scripted
    const tabId = tab.id;
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#FF5A6E" }).catch(() => {});
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ tabId, color: "#FFFFFF" }).catch(() => {});
    await chrome.action.setBadgeText({ tabId, text: "×" }).catch(() => {});
    await chrome.action.setTitle({ tabId, title: "Swarmline can’t run on this page" }).catch(() => {});
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
      chrome.action.setTitle({ tabId, title: TITLE }).catch(() => {});
    }, 2500);
  }
}

chrome.action.onClicked.addListener(build);
