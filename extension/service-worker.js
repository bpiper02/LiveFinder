importScripts('background.js');

function ensureAssistSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(err => {
    console.warn('[LiveFinder] could not configure Assist side panel', err);
  });
}

chrome.runtime.onInstalled.addListener(ensureAssistSidePanel);
chrome.runtime.onStartup.addListener(ensureAssistSidePanel);
ensureAssistSidePanel();
