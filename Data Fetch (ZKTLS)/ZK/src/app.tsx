import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Comlink from 'comlink';
import { PresentationJSON } from 'tlsn-js/build/types';
import './app.scss';
import { generateProof, verifyProof } from './generateProof';
import { TLSNotaryDemo } from './components/TLSNotaryDemo';

// Import the worker for initialization
const { init }: any = Comlink.wrap(
    new Worker(new URL('./worker.ts', import.meta.url)),
);

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(<App />);

// Import configuration constants from generateProof.ts
import { 
    notaryUrl,
    websocketProxyUrl,
    loggingLevel,
    serverUrl
} from './generateProof';

function App(): ReactElement {
    const [initialized, setInitialized] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState<any | null>(null);
    const [presentationJSON, setPresentationJSON] =
        useState<null | PresentationJSON>(null);

    useEffect(() => {
        (async () => {
            console.log('Initializing...');
            await init({ loggingLevel: loggingLevel });
            console.log('Initialized');
            setInitialized(true);
        })();
    }, []);

    const onClick = useCallback(async () => {
        setProcessing(true);
        try {
            // Use the generateProof function from generateProof.ts
            const { presentationJSON } = await generateProof();
            setPresentationJSON(presentationJSON);
        } catch (error) {
            console.error('Error generating proof:', error);
            setProcessing(false);
        }
    }, [setPresentationJSON, setProcessing]);


    useEffect(() => {
        (async () => {
            if (presentationJSON) {
                try {
                    // Use the verifyProof function from generateProof.ts
                    const verificationResult = await verifyProof(presentationJSON);
                    setResult(verificationResult);
                } catch (error) {
                    console.error('Error verifying proof:', error);
                } finally {
                    setProcessing(false);
                }
            }
        })();
    }, [presentationJSON, setResult]);

    return (
        <TLSNotaryDemo
            initialized={initialized}
            processing={processing}
            presentationJSON={presentationJSON}
            result={result}
            serverUrl={serverUrl}
            notaryUrl={notaryUrl}
            websocketProxyUrl={websocketProxyUrl}
            onClick={onClick}
        />
    );
}
