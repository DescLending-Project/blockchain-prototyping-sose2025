/**
 * Main world script for the TLS Notary browser extension
 * Runs in the main JavaScript context of the web page (not in the isolated extension context)
 * Provides an API for web applications to interact with the TLS Notary extension
 */

/**
 * Immediately Invoked Function Expression (IIFE) to avoid polluting the global scope
 * Sets up the TLS Notary API on the window object
 */
(function() {
  // Expose a flag indicating the extension is available
  window.tlsnExtensionAvailable = true;
  
  /**
   * Opens the TLS Notary extension popup
   * Can be called from web applications to launch the extension
   * @returns {boolean} Always returns true to indicate the message was sent
   */
  window.openTLSNExtension = function() {
    // Post message that the content script (isolated world) can hear
    window.postMessage({type: "TLSN_OPEN_EXTENSION"}, "*");
    return true;
  };

  /**
   * Protect the tlsnExtensionAvailable property from being overwritten
   * Makes the property read-only to prevent tampering
   */
  Object.defineProperty(window, 'tlsnExtensionAvailable', {
    value: true,
    writable: false,
    configurable: false
  });

  /**
   * Protect the openTLSNExtension function from being overwritten
   * Makes the function read-only to prevent tampering
   */
  Object.defineProperty(window, 'openTLSNExtension', {
    value: window.openTLSNExtension,
    writable: false,
    configurable: false
  });

  /**
   * Dispatch a custom event to notify the page that the TLS Notary API is ready
   * Web applications can listen for this event to know when they can use the API
   */
  document.dispatchEvent(new CustomEvent('tlsnReady'));
})();