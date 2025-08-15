/**
 * Background script for the TLS Notary browser extension
 * Handles communication between content scripts and the extension
 */

/**
 * Listens for messages from content scripts
 * Opens the extension in a popup window when requested
 * @param {Object} message - The message object
 * @param {string} message.type - The type of message
 * @param {Object} sender - Information about the sender of the message
 * @param {Function} sendResponse - Function to send a response back to the sender
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'OPEN_EXTENSION') {
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

/**
 * Click handler for the extension toolbar icon
 * Opens the extension in a new tab when the icon is clicked
 */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup.html'),
    active: true
  });
});