import {config} from "tls-notary-shared";
import {getSettings} from '../utils/storageUtils';
import {PollingStatusCallback, sendTLSRequest} from '../utils/apiUtils';
import {HttpMethod} from 'tls-notary-shared/dist/types/tls';

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
}

export async function fetchTransactions(statusCallback?: PollingStatusCallback): Promise<{ responseReceived: boolean }> {
  const token = await getToken();

  if (!token) {
    throw new Error('Not authenticated. Please log in first.');
  }

  const userInfo = await getUserInfo();

  if (!userInfo || !userInfo.userId) {
    throw new Error('User information not found. Please log in again.');
  }

  if (!config.openbankingApi) {
    throw new Error('OpenBanking API URL is not configured');
  }
  const apiUrl = `${config.openbankingApi}/plaid/transactions/sandbox/get`;

  const password = await getPassword();

  if (!password) {
    throw new Error('Password not found. Please log in again.');
  }

  const headers = JSON.stringify({
    'Content-Type': 'application/json'
  });

  const body = JSON.stringify({
    client_id: userInfo.username,
    secret: password,
    access_token: token,
    start_date: '2025-01-03',
    end_date: '2025-01-04'
  });

  return sendTLSRequest(apiUrl, HttpMethod.POST, headers, body, statusCallback);
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


export async function getScore(statusCallback?: PollingStatusCallback): Promise<{ responseReceived: boolean }> {
  const token = await getToken();

  if (!token) {
    throw new Error('Not authenticated. Please log in first.');
  }

  const userInfo = await getUserInfo();

  if (!userInfo || !userInfo.userId) {
    throw new Error('User information not found. Please log in again.');
  }

  if (!config.openbankingApi) {
    throw new Error('OpenBanking API URL is not configured');
  }
  const apiUrl = `${config.openbankingApi}/users/${userInfo.userId}/credit-score`;

  return sendTLSRequest(apiUrl, HttpMethod.GET, '{}', '', statusCallback);
}
