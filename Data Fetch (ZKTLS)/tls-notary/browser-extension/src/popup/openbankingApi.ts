import {config, TLSFormData, TLSNotaryService} from "tls-notary-shared";
import {getSettings} from '../utils/storageUtils';

interface AuthResponse {
  public_token: string;
  access_token: string;
  item_id: string;
  request_id: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
}

const TOKEN_STORAGE_KEY = 'openbanking_token';
const USER_INFO_STORAGE_KEY = 'openbanking_user_info';
const PASSWORD_STORAGE_KEY = 'openbanking_password';

export async function authenticate(username: string, password: string): Promise<AuthResponse> {
  try {
    if (!config.openbankingApi) {
      throw new Error('OpenBanking API URL is not configured');
    }
    const apiUrl = `${config.openbankingApi}/plaid/auth/sandbox`;

    // Create request body
    const body = JSON.stringify({
      client_id: username,
      secret: password,
      institution_id: 'ins_109508', // test data
      initial_products: ['auth', 'transactions'], // testdata
    });

    const headers = {
      'Content-Type': 'application/json'
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: body
    });

    if (!response.ok) {
      throw new Error(`Authentication failed with status: ${response.status}`);
    }

    const authResponse: AuthResponse = await response.json();

    if (!authResponse || typeof authResponse !== 'object') {
      throw new Error('Invalid response format from server');
    }

    if (!authResponse.public_token) {
      throw new Error('Authentication token not found in response');
    }

    if (!authResponse.access_token) {
      throw new Error('Access token not found in response');
    }

    if (!authResponse.item_id) {
      throw new Error('Item ID not found in response');
    }

    if (!authResponse.request_id) {
      throw new Error('Request ID not found in response');
    }

    await storeToken(authResponse.access_token);

    await storeUserInfo({
      userId: authResponse.item_id,
      username: username
    });

    await storePassword(password);

    return authResponse;
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

/**
 * Fetch transactions from the OpenBanking API
 * @returns A promise that resolves to an array of transactions
 */
export async function fetchTransactions(): Promise<Transaction[]> {
  console.log('[fetchTransactions] Starting transaction fetch process');
  try {
    console.log('[fetchTransactions] Retrieving authentication token');
    const token = await getToken();

    if (!token) {
      console.error('[fetchTransactions] No authentication token found');
      throw new Error('Not authenticated. Please log in first.');
    }
    console.log('[fetchTransactions] Authentication token retrieved successfully');

    console.log('[fetchTransactions] Retrieving user information');
    const userInfo = await getUserInfo();

    if (!userInfo || !userInfo.userId) {
      console.error('[fetchTransactions] User information not found or incomplete', userInfo);
      throw new Error('User information not found. Please log in again.');
    }
    console.log('[fetchTransactions] User information retrieved successfully', { userId: userInfo.userId, username: userInfo.username });

    if (!config.openbankingApi) {
      console.error('[fetchTransactions] OpenBanking API URL is not configured in config', config);
      throw new Error('OpenBanking API URL is not configured');
    }
    const apiUrl = `${config.openbankingApi}/plaid/transactions/sandbox/get`;
    console.log('[fetchTransactions] Using API URL:', apiUrl);

    console.log('[fetchTransactions] Retrieving settings for notary server');
    const settings = await getSettings();
    const notaryUrl = settings.notaryServer || '';
    console.log('[fetchTransactions] Notary server URL:', notaryUrl);

    if (!notaryUrl) {
      console.error('[fetchTransactions] Notary server URL is not configured in settings', settings);
      throw new Error('Notary server URL is not configured. Please set it in the Settings tab.');
    }

    const remoteDNS = new URL(apiUrl).hostname;
    console.log('[fetchTransactions] Remote DNS:', remoteDNS);

    if (!config.tlsRemotePort) {
      console.error('[fetchTransactions] TLS remote port is not configured in config', config);
      throw new Error('TLS remote port is not configured');
    }
    const remotePort = config.tlsRemotePort;
    console.log('[fetchTransactions] Remote port:', remotePort);

    const localPort = settings.tlsLocalPort || config.tlsLocalPort;
    if (!localPort) {
      console.error('[fetchTransactions] TLS local port is not configured in settings or config', { settings, config });
      throw new Error('TLS local port is not configured');
    }
    console.log('[fetchTransactions] Local port:', localPort);

    console.log('[fetchTransactions] Creating request headers');
    const headers = JSON.stringify({
      'Content-Type': 'application/json'
    });

    console.log('[fetchTransactions] Retrieving stored password');
    const password = await getPassword();

    if (!password) {
      console.error('[fetchTransactions] Password not found in storage');
      throw new Error('Password not found. Please log in again.');
    }
    console.log('[fetchTransactions] Password retrieved successfully');

    console.log('[fetchTransactions] Creating request body with user credentials');
    const body = JSON.stringify({
      client_id: userInfo.username,
      secret: password,
      access_token: token,
      start_date: '2025-01-03',
      end_date: '2025-01-04'
    });
    console.log('[fetchTransactions] Request body prepared (without showing sensitive data)');

    const formData: TLSFormData = {
      url: apiUrl,
      notaryUrl,
      remoteDNS,
      remotePort,
      localPort,
      headers,
      body: body,
      method: 'POST'
    };
    console.log('[fetchTransactions] TLS Notary form data prepared', { 
      url: formData.url,
      notaryUrl: formData.notaryUrl,
      remoteDNS: formData.remoteDNS,
      method: formData.method
    });

    console.log('[fetchTransactions] Sending request to TLSNotaryService');
    const requestId = await TLSNotaryService.sendRequest(formData);
    console.log('[fetchTransactions] Request sent successfully, request ID:', requestId);

    console.log('[fetchTransactions] Retrieving proof record from TLSNotaryService');
    const proofRecord = await TLSNotaryService.getProof(requestId);
    console.log('[fetchTransactions] Proof record retrieved', { 
      hasProofRecord: !!proofRecord,
      hasResponse: !!(proofRecord && proofRecord.tlsCallResponse),
      hasResponseBody: !!(proofRecord && proofRecord.tlsCallResponse && proofRecord.tlsCallResponse.responseBody)
    });

    if (!proofRecord || !proofRecord.tlsCallResponse || !proofRecord.tlsCallResponse.responseBody) {
      console.error('[fetchTransactions] No valid response in proof record', proofRecord);
      throw new Error('No response received from the server');
    }

    console.log('[fetchTransactions] Parsing response body');
    const responseBody = proofRecord.tlsCallResponse.responseBody;
    console.log('[fetchTransactions] Response body (first 100 chars):', responseBody.substring(0, 100) + (responseBody.length > 100 ? '...' : ''));

    try {
      const parsedData = JSON.parse(responseBody);
      console.log('[fetchTransactions] Response parsed successfully', { 
        dataType: typeof parsedData,
        isArray: Array.isArray(parsedData),
        length: Array.isArray(parsedData) ? parsedData.length : 'N/A'
      });

      if (!Array.isArray(parsedData)) {
        console.error('[fetchTransactions] Invalid response format, expected array but got:', typeof parsedData);
        throw new Error('Invalid response format: expected an array of transactions');
      }

      console.log('[fetchTransactions] Processing', parsedData.length, 'transactions');
      const transactions: Transaction[] = parsedData.map((item, index) => {
        if (!item || typeof item !== 'object') {
          console.error(`[fetchTransactions] Invalid transaction at index ${index}:`, item);
          throw new Error(`Invalid transaction at index ${index}: not an object`);
        }

        const transaction: Transaction = {
          id: item.id || `unknown-${index}`,
          date: item.date || new Date().toISOString(),
          description: item.description || 'No description',
          amount: typeof item.amount === 'number' ? item.amount : 0,
          currency: item.currency || 'Unknown'
        };

        return transaction;
      });

      console.log('[fetchTransactions] Successfully processed all transactions', { count: transactions.length });
      return transactions;
    } catch (parseError) {
      console.error('[fetchTransactions] Error parsing response JSON:', parseError);
      console.error('[fetchTransactions] Raw response body:', responseBody);
      throw new Error(`Failed to parse response: ${parseError}`);
    }
  } catch (error) {
    console.error('[fetchTransactions] Error fetching transactions:', error);
    if (error instanceof Error) {
      console.error('[fetchTransactions] Error details:', { 
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    throw error;
  }
}

async function storeToken(token: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

async function getToken(): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    chrome.storage.local.get([TOKEN_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result[TOKEN_STORAGE_KEY] || null);
      }
    });
  });
}

async function storeUserInfo(userInfo: { userId: string, username: string }): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [USER_INFO_STORAGE_KEY]: userInfo }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

async function storePassword(password: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [PASSWORD_STORAGE_KEY]: password }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

async function getPassword(): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    chrome.storage.local.get([PASSWORD_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result[PASSWORD_STORAGE_KEY] || null);
      }
    });
  });
}

async function getUserInfo(): Promise<{ userId: string, username: string } | null> {
  return new Promise<{ userId: string, username: string } | null>((resolve, reject) => {
    chrome.storage.local.get([USER_INFO_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result[USER_INFO_STORAGE_KEY] || null);
      }
    });
  });
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}

export async function logout(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.remove([TOKEN_STORAGE_KEY, USER_INFO_STORAGE_KEY, PASSWORD_STORAGE_KEY], () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

export async function getStoredUserInfo(): Promise<{ userId: string, username: string } | null> {
  return getUserInfo();
}
