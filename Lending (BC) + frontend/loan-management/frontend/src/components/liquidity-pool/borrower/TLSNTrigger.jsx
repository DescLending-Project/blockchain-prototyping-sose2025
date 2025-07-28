import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Alert, AlertDescription } from '../../ui/alert';
import { Shield, ExternalLink, CheckCircle, Loader2 } from 'lucide-react';


// chrome cannot open popups isnide the code, it is either opened by the user or by the extension itself. what we can do is open a window or a tab, not the same however

const TLSNExtensionTrigger = () => {
  // Extension ID for TLS Notary Extension
  const EXTENSION_ID = 'mgnbipbfiobebedfbjgalkajmdodggcc';
  const [isProcessing, setIsProcessing] = useState(false);
  const [justOpened, setJustOpened] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleExtensionOpen = async () => {
    try {
      setIsProcessing(true);
      setErrorMessage('');

      // debugging
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        throw new Error('Please make sure Chrome is being used and the TLS Notary Extension is installed.');
      }

      //send message to extension
      const response = await chrome.runtime.sendMessage(EXTENSION_ID, {
        action: 'open_popup',
        source: 'webapp'
      });

      if (response?.success) {
        setJustOpened(true);
        setTimeout(() => setJustOpened(false), 3000);
        console.log('✅ Extension opened successfully');
      } else {
        throw new Error('Could not open the extension popup');
      }
    } catch (error) {
      console.error(' Error trying to open extension:', error);
      setErrorMessage('Please click the TLS Notary Extension icon in your Chrome toolbar ');
      
      setTimeout(() => {
        if (isProcessing) {
          setErrorMessage('If you cannot see the extension icon, click the puzzle piece icon in Chrome toolbar and pin the TLS Notary Extension (user manually does it now, not entirely integrated)');
        }
      }, 5000);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={handleExtensionOpen}
        disabled={isProcessing}
        className="w-full flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
        size="lg"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening Extension...
          </>
        ) : justOpened ? (
          <>
            <CheckCircle className="h-4 w-4" />
            Extension Opened!
          </>
        ) : (
          <>
            <Shield className="h-4 w-4" />
            Open TLS Notary Extension
            <ExternalLink className="h-4 w-4" />
          </>
        )}
      </Button>

      {errorMessage && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">
            {errorMessage}
          </AlertDescription>
        </Alert>
      )}

      {justOpened && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            TLS Notary Extension should now be open. If not, please click the extension icon in your browser toolbar.
          </AlertDescription>
        </Alert>
      )}

      <div className="text-xs text-gray-500">
        This will open your TLS Notary Extension for financial data verification
      </div>
    </div>
  );
};

export default TLSNExtensionTrigger;