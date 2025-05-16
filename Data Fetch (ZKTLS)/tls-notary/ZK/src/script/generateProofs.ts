import * as Comlink from 'comlink';
import type { TLSCall } from '../types/tls';
import {
    Prover as TProver,
    Presentation as TPresentation,
    NotaryServer,
    Transcript,
    mapStringToRange,
    subtractRanges,
} from 'tlsn-js';
import type { Commit } from 'tlsn-js';
import type { PresentationJSON } from 'tlsn-js/build/types';
import { HTTPParser } from 'http-parser-js';

const { init, Prover, Presentation }: any = Comlink.wrap(
    new Worker(new URL('./worker.ts', import.meta.url)),
);

console.log('Worker set:', { init, Prover, Presentation });

// Configuration constants
//export const notaryUrl = 'https://notary.pse.dev/v0.1.0-alpha.10';
//export const websocketProxyUrl = 'ws://localhost:55688'
export const loggingLevel = 'Debug';

// export const serverDns = 'openbanking-api-826260723607.europe-west3.run.app';
// export const serverUrl = `https://${serverDns}/users/aaa/credit-score`;

/**
 * Parse HTTP message (request or response)
 */
function parseHttpMessage(buffer: Buffer, type: 'request' | 'response') {
    const parser = new HTTPParser(
        type === 'request' ? HTTPParser.REQUEST : HTTPParser.RESPONSE,
    );
    const body: Buffer[] = [];
    let complete = false;
    let headers: string[] = [];

    parser.onBody = (t) => {
        body.push(t);
    };

    parser.onHeadersComplete = (res) => {
        headers = res.headers;
    };

    parser.onMessageComplete = () => {
        complete = true;
    };

    parser.execute(buffer);
    parser.finish();

    if (!complete) throw new Error(`Could not parse ${type.toUpperCase()}`);

    return {
        info: buffer.toString('utf-8').split('\r\n')[0] + '\r\n',
        headers,
        body,
    };
}

/**
 * Generate proof and presentation for TLS request
 * This function replicates the functionality of the onClick function in app.tsx
 * but returns the presentation and proof instead of updating state
 * 
 * @returns {Promise<{presentation: TPresentation, presentationJSON: PresentationJSON}>}
 */
export async function generateProof(
    call: TLSCall,
): Promise<{
    presentation: TPresentation,
    presentationJSON: PresentationJSON
}> {

    console.log('Generating proof for call:', call);
    // Initialize if not already initialized
    await init({
        loggingLevel: loggingLevel,
        wasmURL: '/tlsn/tlsn_wasm_bg.wasm', // adjust to actual name

    });
    console.log('Worker initialized');
    const notary = NotaryServer.from(call.notaryUrl);
    console.time('submit');
    console.log('Submitting request to notary');
    const prover = (await new Prover({
        serverDns: call.serverDNS,
        maxRecvData: 2048,
    })) as TProver;
    console.log('Setting up Prover');
    let sessionUrl = await notary.sessionUrl()
    console.log('Session URL:', sessionUrl);

    await prover.setup(sessionUrl);
    console.log('Prover setup done');

    const resp = await prover.sendRequest(call.websocketProxyUrl, {
        url: call.request.url,
        method: call.request.method,
        headers: call.request.headers,
        body: call.request.body,
    });
    console.log('Request sent');

    console.timeEnd('submit');
    console.log(resp);

    console.time('transcript');
    console.log('Waiting for transcript...');
    const transcript = await prover.transcript();
    console.log('Transcript:', transcript);
    const { sent, recv } = transcript;
    console.log(new Transcript({ sent, recv }));
    console.timeEnd('transcript');
    console.time('commit');

    const {
        info: recvInfo,
        headers: recvHeaders,
        body: recvBody,
    } = parseHttpMessage(Buffer.from(recv), 'response');

    console.log("Before parse")
    const body = JSON.parse(recvBody[0].toString());
    console.log("After parse ", body)
    console.log("Score: ", body.data.score.value)

    const commit: Commit = {
        sent: subtractRanges(
            { start: 0, end: sent.length },
            mapStringToRange(
                ['secret: test_secret'],
                Buffer.from(sent).toString('utf-8'),
            ),
        ),
        recv: [
            ...mapStringToRange(
                [
                    recvInfo,
                    `${recvHeaders[4]}: ${recvHeaders[5]}\r\n`,
                    `${recvHeaders[6]}: ${recvHeaders[7]}\r\n`,
                    `${recvHeaders[8]}: ${recvHeaders[9]}\r\n`,
                    `${recvHeaders[10]}: ${recvHeaders[11]}\r\n`,
                    // `${recvHeaders[12]}: ${recvHeaders[13]}`,
                    // `${recvHeaders[14]}: ${recvHeaders[15]}`,
                    // `${recvHeaders[16]}: ${recvHeaders[17]}`,
                    // `${recvHeaders[18]}: ${recvHeaders[19]}`,
                    `"message":"${body.message}"`,
                    `"userId":"${body.data.userId}"`,
                    `"value":${body.data.score.value}`, // here no "" as the returned value is integer
                    `"path":"${body.path}"`,
                ],
                Buffer.from(recv).toString('utf-8'),
            ),
        ],
    };
    const notarizationOutputs = await prover.notarize(commit);
    console.timeEnd('commit');
    console.time('proof');

    const presentation = (await new Presentation({
        attestationHex: notarizationOutputs.attestation,
        secretsHex: notarizationOutputs.secrets,
        notaryUrl: notarizationOutputs.notaryUrl,
        websocketProxyUrl: notarizationOutputs.websocketProxyUrl,
        reveal: commit,
    })) as TPresentation;

    console.log(await presentation.serialize());
    const presentationJSON = await presentation.json();
    console.timeEnd('proof');

    return {
        presentation,
        presentationJSON
    };
}

/**
 * Verify a presentation and return the verification result
 * 
 * @param presentationJSON The presentation JSON to verify
 * @returns The verification result
 */
export async function verifyProof(notaryUrl: string, presentationJSON: PresentationJSON): Promise<any> {
    const proof = (await new Presentation(
        presentationJSON.data,
    )) as TPresentation;
    const notary = NotaryServer.from(notaryUrl);
    const notaryKey = await notary.publicKey('hex');
    const verifierOutput = await proof.verify();
    const transcript = new Transcript({
        sent: verifierOutput.transcript.sent,
        recv: verifierOutput.transcript.recv,
    });
    const vk = await proof.verifyingKey();

    return {
        time: verifierOutput.connection_info.time,
        verifyingKey: Buffer.from(vk.data).toString('hex'),
        notaryKey: notaryKey,
        serverName: verifierOutput.server_name,
        sent: transcript.sent(),
        recv: transcript.recv(),
    };
}