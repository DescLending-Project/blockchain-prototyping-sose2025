import {config} from "tls-notary-shared";
import {PollingStatusCallback, sendTLSRequest} from '../utils/apiUtils';
import {HttpMethod} from 'tls-notary-shared/dist/types/tls';
import {storeValue, getValue, removeValues, validateApiUrl} from '../utils/authUtils';

interface AuthResponse {
  public_token: string;
  access_token: string;
  item_id: string;
  request_id: string;
}

const TOKEN_STORAGE_KEY = 'openbanking_token';
const USER_INFO_STORAGE_KEY = 'openbanking_user_info';
const PASSWORD_STORAGE_KEY = 'openbanking_password';

/**
 * Authenticates a user with the OpenBanking API
 * Sends authentication request to the sandbox API and stores the tokens
 * Validates the response and saves user information for future requests
 * @param username - The username (client ID) for authentication
 * @param password - The password (secret) for authentication
 * @returns Promise resolving to the authentication response
 * @throws Error if authentication fails or response is invalid
 */
export async function authenticate(username: string, password: string): Promise<AuthResponse> {
  validateApiUrl(config.openbankingApi);
  const apiUrl = `${config.openbankingApi}/plaid/auth/sandbox`;

  const body = JSON.stringify({
    client_id: username,
    secret: password,
    institution_id: 'ins_109508', // test data
    initial_products: ['auth', 'transactions'], // test data
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

/**
 * Get the first day of the previous month in YYYY-MM-DD format
 * @returns The first day of the previous month as a string
 */
function getFirstDayOfPreviousMonth(): string {
  const date = new Date();
  // Set the date to the 1st and reduce the month by 1 (automatically handles year transitions)
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().split('T')[0];
}

/**
 * Get the last day of the previous month in YYYY-MM-DD format
 * @returns The last day of the previous month as a string
 */
function getLastDayOfPreviousMonth(): string {
  const date = new Date();
  // Move to the first day of the current month, then subtract 1 day to get the last day of the previous month
  date.setDate(1); // Set to the first day of the current month
  date.setDate(0); // Subtract 1 day, which moves to the last day of the previous month
  return date.toISOString().split('T')[0];
}

/**
 * Fetches transactions from the OpenBanking API
 * Retrieves transactions for the previous month using stored credentials
 * Uses TLS Notary to generate a verifiable proof of the response
 * @param statusCallback - Optional callback to receive status updates during the request
 * @returns Promise resolving to an object indicating if the response was received
 * @throws Error if not authenticated or user information is missing
 */
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
    start_date: getFirstDayOfPreviousMonth(),
    end_date: getLastDayOfPreviousMonth()
  });

  return sendTLSRequest(apiUrl, HttpMethod.POST, headers, body, statusCallback);
}

/**
 * Retrieves the stored authentication token
 * @returns Promise resolving to the token or null if not found
 */
async function getToken(): Promise<string | null> {
  return getValue<string>(TOKEN_STORAGE_KEY);
}

/**
 * Retrieves the stored password
 * @returns Promise resolving to the password or null if not found
 */
async function getPassword(): Promise<string | null> {
  return getValue<string>(PASSWORD_STORAGE_KEY);
}

/**
 * Retrieves the stored user information
 * @returns Promise resolving to the user information or null if not found
 */
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