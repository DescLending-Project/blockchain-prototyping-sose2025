import {config} from "tls-notary-shared";
import {getSettings} from '../utils/storageUtils';
import {PollingStatusCallback, sendTLSRequest} from '../utils/apiUtils';
import {HttpMethod} from 'tls-notary-shared/dist/types/tls';
import {storeValue, getValue, removeValues, validateApiUrl} from '../utils/authUtils';

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
  validateApiUrl(config.openbankingApi);
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

  await storeValue(TOKEN_STORAGE_KEY, authResponse.access_token);

  await storeValue(USER_INFO_STORAGE_KEY, {
    userId: authResponse.item_id,
    username: username
  });

  await storeValue(PASSWORD_STORAGE_KEY, password);

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

  validateApiUrl(config.openbankingApi);
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

async function getToken(): Promise<string | null> {
  return getValue<string>(TOKEN_STORAGE_KEY);
}

async function getPassword(): Promise<string | null> {
  return getValue<string>(PASSWORD_STORAGE_KEY);
}

async function getUserInfo(): Promise<{ userId: string, username: string } | null> {
  return getValue<{ userId: string, username: string }>(USER_INFO_STORAGE_KEY);
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}

export async function logout(): Promise<void> {
  return removeValues([TOKEN_STORAGE_KEY, USER_INFO_STORAGE_KEY, PASSWORD_STORAGE_KEY]);
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

  validateApiUrl(config.openbankingApi);
  const apiUrl = `${config.openbankingApi}/users/${userInfo.userId}/credit-score`;

  return sendTLSRequest(apiUrl, HttpMethod.GET, '{}', '', statusCallback);
}