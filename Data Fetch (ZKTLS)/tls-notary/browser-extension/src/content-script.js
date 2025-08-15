/**
 * Content script for the TLS Notary browser extension
 * Runs in the context of web pages and facilitates communication between the page and the extension
 */

/**
 * Immediately Invoked Function Expression (IIFE) to avoid polluting the global scope
 * Sets up message listeners and injects the main world script
 */
(function() {
  /**
   * Listens for messages from the web page
   * Handles TLSN_OPEN_EXTENSION messages to open the extension popup
   * @param {MessageEvent} event - The message event from the web page
   */
  window.addEventListener("message", (event) => {
    // We only accept messages from ourselves
    if (event.source !== window) {
      return;
    }

    if (event.data.type && (event.data.type === "TLSN_OPEN_EXTENSION")) {
      console.log("Content script received: TLSN_OPEN_EXTENSION");
      // Send message to extension background script
      chrome.runtime.sendMessage({type: 'OPEN_EXTENSION'});
    }
  }, false);

  /**
   * Injects the main-world-script.js into the page's main JavaScript context
   * This allows the script to interact with the page's JavaScript environment directly
   * The script is removed after it loads to avoid cluttering the DOM
   */
  function injectMainWorldScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('main-world-script.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  // Check if DOM is ready and inject the script accordingly
  if (document.readyState === 'loading') {
    // If DOM is still loading, wait for it to be ready
    document.addEventListener('DOMContentLoaded', injectMainWorldScript);
  } else {
    // If DOM is already ready, inject immediately
    injectMainWorldScript();
  }
})();