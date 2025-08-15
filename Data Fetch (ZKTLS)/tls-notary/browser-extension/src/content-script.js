// content-script.js
(function() {
  console.log('Content script starting in isolated world...');

  // Listen for messages from the web page
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

  // Inject a script into the MAIN WORLD (not isolated world)
  // This is the key - we need to inject into the main world where React runs
  function injectMainWorldScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('main-world-script.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  // Inject when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectMainWorldScript);
  } else {
    injectMainWorldScript();
  }

  console.log('Content script setup complete');
})();