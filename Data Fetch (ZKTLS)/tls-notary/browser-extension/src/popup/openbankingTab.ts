import { 
  authenticate, 
  fetchTransactions, 
  isAuthenticated, 
  logout, 
  getStoredUserInfo,
  getScore
} from './openbankingApi';
import {
  showLoadingIndicator,
  createStatusUpdateCallback,
  showErrorMessage,
  showSuccessMessage,
  setButtonState,
  setButtonText,
  setButtonsState
} from '../utils/uiUtils';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
}

export function setupOpenbankingTab(): void {
  const loginState = document.getElementById('openbanking-login-state');
  const authenticatedState = document.getElementById('openbanking-authenticated-state');
  const loginBtn = document.getElementById('openbanking-login-btn');
  const logoutBtn = document.getElementById('openbanking-logout-btn');
  const fetchTransactionsBtn = document.getElementById('openbanking-fetch-transactions-btn');
  const getScoreBtn = document.getElementById('openbanking-get-score-btn');
  const usernameInput = document.getElementById('openbanking-username') as HTMLInputElement;
  const passwordInput = document.getElementById('openbanking-password') as HTMLInputElement;
  const loginError = document.getElementById('openbanking-login-error');
  const userName = document.getElementById('openbanking-user-name');
  const accountId = document.getElementById('openbanking-account-id');
  const transactionsContainer = document.getElementById('openbanking-transactions');
  const transactionsList = document.getElementById('openbanking-transactions-list');

  if (!loginState || !authenticatedState || !loginBtn || !logoutBtn ||
      !fetchTransactionsBtn || !getScoreBtn || !usernameInput || !passwordInput || 
      !loginError || !userName || !accountId || 
      !transactionsContainer || !transactionsList) {
    return;
  }

  checkAuthenticationStatus();

  loginBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  fetchTransactionsBtn.addEventListener('click', handleFetchTransactions);
  getScoreBtn.addEventListener('click', handleGetScore);

  async function checkAuthenticationStatus(): Promise<void> {
    try {
      const authenticated = await isAuthenticated();

      if (authenticated) {
        const userInfo = await getStoredUserInfo();

        if (userInfo) {
          userName!.textContent = userInfo.username;
          accountId!.textContent = userInfo.userId;

          loginState!.style.display = 'none';
          authenticatedState!.style.display = 'block';
        } else {
          loginState!.style.display = 'block';
          authenticatedState!.style.display = 'none';
        }
      } else {
        loginState!.style.display = 'block';
        authenticatedState!.style.display = 'none';
      }
    } catch (error) {
      loginState!.style.display = 'block';
      authenticatedState!.style.display = 'none';
    }
  }

  async function handleLogin(): Promise<void> {
    try {
      loginError!.textContent = '';
      loginError!.style.display = 'none';

      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (!username || !password) {
        loginError!.textContent = 'Please enter both username and password';
        loginError!.style.display = 'block';
        return;
      }

      setButtonText(loginBtn!, 'Logging in...');
      setButtonState(loginBtn!, true);

      const authResponse = await authenticate(username, password);

      if (!authResponse) {
        throw new Error('Authentication failed: Invalid response from server');
      }

      const userInfo = await getStoredUserInfo();

      if (!userInfo) {
        throw new Error('Authentication failed: User information not available');
      }

      userName!.textContent = userInfo.username;
      accountId!.textContent = userInfo.userId;

      loginState!.style.display = 'none';
      authenticatedState!.style.display = 'block';

      usernameInput.value = '';
      passwordInput.value = '';
    } catch (error) {
      loginError!.textContent = error instanceof Error ? error.message : 'Authentication failed';
      loginError!.style.display = 'block';
    } finally {
      setButtonText(loginBtn!, 'Login');
      setButtonState(loginBtn!, false);
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      setButtonState(logoutBtn!, true);

      await logout();

      loginState!.style.display = 'block';
      authenticatedState!.style.display = 'none';

      transactionsContainer!.style.display = 'none';

      transactionsList!.innerHTML = '';
    } catch (error) {
      // Handle logout error silently
    } finally {
      setButtonState(logoutBtn!, false);
    }
  }

  async function handleFetchTransactions(): Promise<void> {
    try {
      setButtonsState([fetchTransactionsBtn!, getScoreBtn!], true);
      setButtonText(fetchTransactionsBtn!, 'Fetching...');

      const loadingElement = showLoadingIndicator(
        transactionsContainer!, 
        transactionsList!, 
        'Fetching credit score data. This may take a moment...'
      );

      const updateStatus = createStatusUpdateCallback(
        loadingElement, 
        'Fetching credit score data. Please wait...'
      );

      const startTime = performance.now();
      const result = await fetchTransactions(updateStatus);
      const endTime = performance.now();
      console.log(`[handleFetchTransactions] fetchTransactions completed in ${(endTime - startTime).toFixed(2)}ms`);

      transactionsList!.innerHTML = '';

      if (!result || !result.responseReceived) {
        console.error('[handleFetchTransactions] Failed to receive response');
        showErrorMessage(
          transactionsList!, 
          transactionsContainer!, 
          new Error('Failed to receive response'), 
          'Failed to retrieve transactions'
        );
        return;
      }

      showSuccessMessage(transactionsList!);
      transactionsContainer!.style.display = 'block';
    } catch (error) {
      showErrorMessage(
        transactionsList!, 
        transactionsContainer!, 
        error, 
        'Failed to fetch transactions'
      );
    } finally {
      setButtonsState([fetchTransactionsBtn!, getScoreBtn!], false);
      setButtonText(fetchTransactionsBtn!, 'Fetch Credit Score');
    }
  }

  async function handleGetScore(): Promise<void> {
    try {
      setButtonsState([fetchTransactionsBtn!, getScoreBtn!], true);
      setButtonText(getScoreBtn!, 'Getting Score...');

      const loadingElement = showLoadingIndicator(
        transactionsContainer!,
        transactionsList!,
        'Retrieving credit score. This may take a moment...'
      );

      const userInfo = await getStoredUserInfo();

      const updateStatus = createStatusUpdateCallback(
        loadingElement, 
        'Retrieving credit score. Please wait...'
      );

      const result = await getScore(updateStatus);

      transactionsList!.innerHTML = '';

      if (!result || !result.responseReceived) {
        showErrorMessage(
          transactionsList!,
          transactionsContainer!,
          new Error('Failed to receive response'),
          'Failed to retrieve credit score'
        );
        return;
      }

      showSuccessMessage(transactionsList!);
      transactionsContainer!.style.display = 'block';
    } catch (error) {
      showErrorMessage(
        transactionsList!,
        transactionsContainer!,
        error,
        'Failed to fetch credit score'
      );
    } finally {
      setButtonsState([fetchTransactionsBtn!, getScoreBtn!], false);
      setButtonText(getScoreBtn!, 'Get Score');
    }
  }
}
