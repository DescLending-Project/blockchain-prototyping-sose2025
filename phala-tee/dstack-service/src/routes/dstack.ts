/**
 * @fileoverview DStack TEE Service API routes
 * This file contains route handlers for interacting with Trusted Execution Environment
 * services through the Phala DStack SDK.
 */
import { Router, Request, Response } from 'express';
import { TappdClient, Hex } from '@phala/dstack-sdk';

const router = Router();
const client = new TappdClient();

/**
 * Represents a cryptographic key with its certificate chain.
 *
 * @interface Key
 * @property {string} key - The cryptographic key string.
 * @property {string[]} certificate_chain - An array of certificates forming the certificate chain that validates the key's authenticity.
 */
interface Key { 
    key: string
    certificate_chain: string[]
    as_uint_8_array?: Uint8Array
}

/**
 * Represents a quote response from a TEE enclave.
 * @interface Quote
 * @property {Hex} quote - The hexadecimal representation of the attestation quote.
 * @property {string} event_log - The event log associated with the quote generation.
 */
export interface Quote {
    quote: Hex
    event_log: string
}

/**
 * Derives a cryptographic key and its certificate chain from the TEE
 * 
 * @route GET /dstack/derive-key
 * @returns {Key} JSON object containing the derived key and certificate chain
 * @throws {500} If key derivation fails
 */
router.get('/derive-key', async (_req: Request, res: Response) => {
    console.log('Deriving key from TEE...');
    try {
        const key = await client.deriveKey();
        const key_uint_8_array = key.asUint8Array ? key.asUint8Array() : undefined;
        console.log('Key derived successfully:', key);
        res.json({ key: key, certificate_chain: key.certificate_chain, as_uint_8_array: key_uint_8_array });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to derive key' });
    }
});

/**
 * Generates a TEE attestation quote based on provided report data
 * 
 * @route POST /dstack/tdx-quote
 * @bodyParam {string} report_data - Hexadecimal string representing the report data to be included in the quote
 * @returns {Quote} JSON object containing the attestation quote and event log
 * @throws {400} If report_data is missing
 * @throws {500} If quote generation fails
 */
router.post('/tdx-quote', async (req: Request, res: Response) => {
    console.log('Generating TDX quote...');
    try {
        const { report_data } = req.body;
        if (!report_data) {
            res.status(400).json({ error: 'Missing report_data' });
        }

        const { quote, event_log }: Quote = await client.tdxQuote(report_data, 'keccak256');
        console.log('TDX quote generated successfully:', quote, event_log);
        res.json({ quote, event_log });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate quote' });
    }
});

/**
 * Checks if the TEE service is reachable
 * 
 * @route GET /dstack
 * @returns {Object} JSON object with reachability status
 * @throws {500} If the check fails
 */
router.get('/', async (_req: Request, res: Response) => {
    console.log('Checking if TEE service is reachable...');
    try {
        const info = await client.isReachable();
        console.log('TEE service is reachable:', info);
        res.json(info);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to retrieve info' });
    }
});

/**
 * Gets detailed information about the TEE service
 * 
 * @route GET /dstack/info
 * @returns {Object} JSON object with service information
 * @throws {500} If retrieving information fails
 */
router.get('/info', async (_req: Request, res: Response) => {
    console.log('Retrieving TEE service info...');
    try {
        const info = await client.info();
        console.log('TEE service info retrieved successfully:', info);
        res.json(info);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to retrieve info' });
    }
});

export default router;