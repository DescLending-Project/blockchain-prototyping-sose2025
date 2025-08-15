import * as Comlink from 'comlink';
import type { TLSCallRequest, TLSCallResponse, VerifyProofResult } from '../types/tls';
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
import { Buffer} from "buffer";

const { init, Prover, Presentation }: any = Comlink.wrap(
  new Worker(new URL('./worker.ts', import.meta.url)),
);

export const loggingLevel = 'Debug';

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
 * Extracts HTTP header strings from a flat array of header names and values, starting from the fifth element.
 * The function starts at the fifth element (index 4) because, in many HTTP libraries or protocols, the first few
 * elements of a headers array may contain metadata or non-header information (such as method, URL, or protocol version).
 * By skipping the first four elements, the function ensures it only processes actual header name-value pairs.
 * @param headers - An array of strings where even indices (starting from index 4) are header names and the following odd indices are their corresponding values.
 * @returns An array of formatted header strings in the form "Header-Name: Header-Value\r\n".
 *
 * @remarks
 * This function skips the first four elements of the input array and processes the rest in pairs.
 * Only pairs where both the header name and value are present are included in the result.
 */
function extractHeaderStrings(headers: string[]): string[] {
    const headerStrings: string[] = [];
    for (let i = 4; i < headers.length; i += 2) {
        if (headers[i] && headers[i + 1]) {
            headerStrings.push(`${headers[i]}: ${headers[i + 1]}\r\n`);
        }
    }
    return headerStrings;
}

let wasmInitialized = false;

/**
 * Generates a TLS proof for a given TLS call request using a notary server and prover.
 *
 * This function initializes the WASM module if necessary, sets up a prover session with the notary,
 * sends the HTTP request through the prover, and parses the HTTP response. It dynamically reveals
 * all top-level fields in the JSON response body for inclusion in the proof. The function then
 * creates a commit object specifying which parts of the sent and received data are revealed,
 * notarizes the commit, and constructs a presentation object containing the attestation and secrets.
 *
 * @param call - The TLS call request containing notary URL, server DNS, websocket proxy URL, and HTTP request details.
 * @returns A promise that resolves to a TLS call response, including the parsed response body, the presentation object, and its JSON representation.
 *
 * @throws Will throw an error if the HTTP response body is not valid JSON or if any step in the proof generation fails.
 */

export async function generateProof(
  call: TLSCallRequest,
): Promise<TLSCallResponse> {
    await initWasm();

    const notary = NotaryServer.from(call.notaryUrl);

    const prover = (await new Prover({
        serverDns: call.serverDNS,
        maxRecvData: 15048,
    })) as TProver;

    let sessionUrl = await notary.sessionUrl();

    await prover.setup(sessionUrl);

    let bodyData = call.request.body === '' ? '' : JSON.parse(call.request.body)
    const resp = await prover.sendRequest(call.websocketProxyUrl, {
        url: call.request.url,
        method: call.request.method,
        headers: call.request.headers,
        body: bodyData,
    });

    const transcript = await prover.transcript();
    const { sent, recv } = transcript;

    const {
        info: recvInfo,
        headers: recvHeaders,
        body: recvBody,
    } = parseHttpMessage(Buffer.from(recv), 'response');

    const rawBody = Buffer.concat(recvBody).toString();

    let body;
    try {
        body = JSON.parse(rawBody);
    } catch (error) {
        console.error('Error parsing response body as JSON:', error);
        // If it's not JSON, use the raw body as a string
        body = { rawResponse: rawBody };
    }

    const revealFields = Object.entries(body).reduce((acc, [key, value]) => {
        if (typeof value === 'object' && value !== null) {
            acc.push(...flattenObjectToStrings(value));
        } else {
            const formattedValue =
              typeof value === 'string' ? `"${value}"` : value; // Quote strings, leave other types as is
            acc.push(`"${key}":${formattedValue}`);
        }
        return acc;
    }, [] as string[]);

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
                  ...extractHeaderStrings(recvHeaders),
                  ...revealFields,
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
 * @param notaryUrl Url of notary server to use
 * @param presentationJSON The presentation JSON to verify
 * @returns The verification result
 */

export async function verifyProof(notaryUrl: string, presentationJSON: PresentationJSON): Promise<VerifyProofResult> {
    await initWasm();

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

function flattenObjectToStrings(obj: Record<string, any>, separator: string = '.'): string[] {
    const result: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
            result.push(...flattenObjectToStrings(value, separator));
        } else {
            const formattedValue =
              typeof value === 'string' ? `"${value}"` : value; // Quote strings, leave other values as is
            result.push(`"${key}":${formattedValue}`);
        }
    }

    return result;
}


async function initWasm() {
    if (!wasmInitialized) {
        try {
            await init({
                loggingLevel: loggingLevel,
                // wasmURL: '/build/tlsn_wasm_bg.wasm',
            });
            wasmInitialized = true;
        } catch (error) {
            console.error('Error initializing WASM:', error);
            throw new Error('Failed to initialize WASM. Please check if the WASM file exists at the specified path.');
        }
    }
}