// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_EXTENSION') {
    console.log('Opening TLSN extension from web page request');
    
    // Open extension in a popup window
    chrome.windows.create({
      url: 'popup.html',
      type: 'popup',
      width: 900,
      height: 700,
      focused: true
    });
  }
});

// Keep the existing click handler for toolbar icon
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup.html'),
    active: true
  });
});

console.log('TLSN Background script loaded');