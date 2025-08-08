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
    console.log('Starting generateProof function with request:', {
        url: call.request.url,
        method: call.request.method,
        serverDNS: call.serverDNS,
        notaryUrl: call.notaryUrl
    });

    await initWasm();

    console.log('Creating notary server from URL:', call.notaryUrl);
    const notary = NotaryServer.from(call.notaryUrl);

    console.log('Creating prover with serverDns:', call.serverDNS);
    const prover = (await new Prover({
        serverDns: call.serverDNS,
        maxRecvData: 12048,
    })) as TProver;

    console.log('Getting session URL from notary');
    let sessionUrl = await notary.sessionUrl();
    console.log('Received session URL:', sessionUrl);

    console.log('Setting up prover with session URL');
    await prover.setup(sessionUrl);

    console.log('Sending request through prover to:', call.request.url, 'via websocket proxy:', call.websocketProxyUrl);
    console.log('Request headers:', call.request.headers);
    console.log('Request body:', call.request.body);
    let bodyData = call.request.body === '' ? '' : JSON.parse(call.request.body)
    const resp = await prover.sendRequest(call.websocketProxyUrl, {
        url: call.request.url,
        method: call.request.method,
        headers: call.request.headers,
        body: bodyData,
    });
    console.log('Request sent successfully, response received');

    console.log('Getting transcript from prover');
    const transcript = await prover.transcript();
    const { sent, recv } = transcript;
    console.log('Transcript received, sent size:', sent.length, 'bytes, received size:', recv.length, 'bytes');


    console.log('Parsing HTTP response message');
    const {
        info: recvInfo,
        headers: recvHeaders,
        body: recvBody,
    } = parseHttpMessage(Buffer.from(recv), 'response');
    console.log('Response info:', recvInfo);
    console.log('Response headers count:', recvHeaders.length / 2);

    console.log('Processing response body');
    const rawBody = Buffer.concat(recvBody).toString();
    console.log('Raw recvBody:', rawBody);

    let body;
    try {
        console.log('Attempting to parse response body as JSON');
        body = JSON.parse(rawBody);
        console.log('Successfully parsed response body as JSON');
    } catch (error) {
        console.error('Error parsing response body as JSON:', error);
        console.log('Using raw body as string instead');
        // If it's not JSON, use the raw body as a string
        body = { rawResponse: rawBody };
    }

    console.log('Generating reveal fields from response body');
    const revealFields = Object.entries(body).reduce((acc, [key, value]) => {
        if (typeof value === 'object' && value !== null) {
            console.log(`Processing nested object for key: ${key}`);
            acc.push(...flattenObjectToStrings(value));
        } else {
            console.log(`Processing simple value for key: ${key}, type: ${typeof value}`);
            const formattedValue =
                typeof value === 'string' ? `"${value}"` : value; // Quote strings, leave other types as is
            acc.push(`"${key}":${formattedValue}`);
        }
        return acc;
    }, [] as string[]);

    console.log('Reveal fields:', revealFields);

    console.log('Creating commit object');
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
    console.log('Commit object created with sent and recv ranges');

    console.log('Notarizing commit with prover');
    const notarizationOutputs = await prover.notarize(commit);
    console.log('Notarization completed successfully');

    console.log('Creating presentation object');
    const presentation = (await new Presentation({
        attestationHex: notarizationOutputs.attestation,
        secretsHex: notarizationOutputs.secrets,
        notaryUrl: notarizationOutputs.notaryUrl,
        websocketProxyUrl: notarizationOutputs.websocketProxyUrl,
        reveal: commit,
    })) as TPresentation;
    console.log('Presentation object created successfully');

    console.log('Converting presentation to JSON');
    const presentationJSON = await presentation.json();
    console.log('Presentation JSON created successfully');

    console.log('generateProof function completed successfully');
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
    console.log('Starting verifyProof function with notaryUrl:', notaryUrl);

    await initWasm();

    console.log('Creating presentation object from JSON data:', presentationJSON.data);
    const proof = (await new Presentation(
        presentationJSON.data,
    )) as TPresentation;
    console.log('Presentation object created successfully');

    console.log('Creating notary server from URL:', notaryUrl);
    const notary = NotaryServer.from(notaryUrl);

    console.log('Getting notary public key');
    const notaryKey = await notary.publicKey('hex');
    console.log('Notary public key received:', notaryKey);

    console.log('Verifying proof');
    const verifierOutput = await proof.verify();
    console.log('Proof verified successfully');

    console.log('Creating transcript from verifier output');
    const transcript = new Transcript({
        sent: verifierOutput.transcript.sent,
        recv: verifierOutput.transcript.recv,
    });
    console.log('Transcript created successfully');

    console.log('Getting verifying key from proof');
    const vk = await proof.verifyingKey();
    console.log('Verifying key received');

    console.log('verifyProof function completed successfully');
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
    console.log('flattenObjectToStrings called with object:', typeof obj);
    const result: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
            console.log(`Flattening nested object for key: ${key}`);
            result.push(...flattenObjectToStrings(value, separator));
        } else {
            console.log(`Formatting value for key: ${key}, type: ${typeof value}`);
            const formattedValue =
                typeof value === 'string' ? `"${value}"` : value; // Quote strings, leave other values as is
            result.push(`"${key}":${formattedValue}`);
        }
    }

    console.log(`flattenObjectToStrings returning ${result.length} entries`);
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