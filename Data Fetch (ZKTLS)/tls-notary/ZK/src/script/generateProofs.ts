import * as Comlink from 'comlink';
import type { TLSCall, TLSCallResponse, VerifyProofResult } from '../types/tls';
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
): Promise<TLSCallResponse> {

    // Initialize if not already initialized
    await init({
        loggingLevel: loggingLevel,
        wasmURL: '/tlsn/tlsn_wasm_bg.wasm', // adjust to actual name

    });
    const notary = NotaryServer.from(call.notaryUrl);
    const prover = (await new Prover({
        serverDns: call.serverDNS,
        maxRecvData: 2048,
    })) as TProver;
    let sessionUrl = await notary.sessionUrl()

    await prover.setup(sessionUrl);

    const resp = await prover.sendRequest(call.websocketProxyUrl, {
        url: call.request.url,
        method: call.request.method,
        headers: call.request.headers,
        body: call.request.body,
    });


    const transcript = await prover.transcript();
    const { sent, recv } = transcript;


    const {
        info: recvInfo,
        headers: recvHeaders,
        body: recvBody,
    } = parseHttpMessage(Buffer.from(recv), 'response');

    const body = JSON.parse(recvBody[0].toString());

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

    const presentation = (await new Presentation({
        attestationHex: notarizationOutputs.attestation,
        secretsHex: notarizationOutputs.secrets,
        notaryUrl: notarizationOutputs.notaryUrl,
        websocketProxyUrl: notarizationOutputs.websocketProxyUrl,
        reveal: commit,
    })) as TPresentation;

    const presentationJSON = await presentation.json();

    return {
            responseBody: body,
            presentation: presentation,
            presentationJSON: presentationJSON,
        
    };
}

/**
 * Verify a presentation and return the verification result
 * 
 * @param presentationJSON The presentation JSON to verify
 * @returns The verification result
 */


export async function verifyProof(notaryUrl: string, presentationJSON: PresentationJSON): Promise<VerifyProofResult> {
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