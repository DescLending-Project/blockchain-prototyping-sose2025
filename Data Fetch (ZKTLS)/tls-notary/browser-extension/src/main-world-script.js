// main-world-script.js
// This script runs in the MAIN WORLD where your React app can see it
(function() {
  console.log('Main world script injected');

  // This will be visible to your React app
  window.tlsnExtensionAvailable = true;
  
  window.openTLSNExtension = function() {
    console.log('openTLSNExtension called from main world');
    // Post message that the content script (isolated world) can hear
    window.postMessage({type: "TLSN_OPEN_EXTENSION"}, "*");
    return true;
  };

  // Protect from overwrites
  Object.defineProperty(window, 'tlsnExtensionAvailable', {
    value: true,
    writable: false,
    configurable: false
  });

  Object.defineProperty(window, 'openTLSNExtension', {
    value: window.openTLSNExtension,
    writable: false,
    configurable: false
  });

  console.log('TLSN API injected into main world');
  console.log('window.openTLSNExtension =', typeof window.openTLSNExtension);

  // Dispatch event to notify the page
  document.dispatchEvent(new CustomEvent('tlsnReady'));
})();