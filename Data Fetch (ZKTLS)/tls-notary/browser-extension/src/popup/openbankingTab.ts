import { 
  authenticate, 
  fetchTransactions, 
  isAuthenticated, 
  logout, 
  getStoredUserInfo 
} from './openbankingApi';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
}

export function setupOpenbankingTab(): void {
  console.log('Setting up OpenBanking API tab');

  // Get elements
  const loginState = document.getElementById('openbanking-login-state');
  const authenticatedState = document.getElementById('openbanking-authenticated-state');
  const loginBtn = document.getElementById('openbanking-login-btn');
  const logoutBtn = document.getElementById('openbanking-logout-btn');
  const fetchTransactionsBtn = document.getElementById('openbanking-fetch-transactions-btn');
  const usernameInput = document.getElementById('openbanking-username') as HTMLInputElement;
  const passwordInput = document.getElementById('openbanking-password') as HTMLInputElement;
  const loginError = document.getElementById('openbanking-login-error');
  const userName = document.getElementById('openbanking-user-name');
  const accountId = document.getElementById('openbanking-account-id');
  const transactionsContainer = document.getElementById('openbanking-transactions');
  const transactionsList = document.getElementById('openbanking-transactions-list');

  if (!loginState || !authenticatedState || !loginBtn || !logoutBtn ||
      !fetchTransactionsBtn || !usernameInput || !passwordInput || 
      !loginError || !userName || !accountId || 
      !transactionsContainer || !transactionsList) {
    console.error('Required elements not found for OpenBanking API tab');
    return;
  }

  checkAuthenticationStatus();

  loginBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  fetchTransactionsBtn.addEventListener('click', handleFetchTransactions);

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
      console.error('Error checking authentication status:', error);
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

      loginBtn!.textContent = 'Logging in...';
      loginBtn!.setAttribute('disabled', 'true');

      const authResponse = await authenticate(username, password);

      if (!authResponse) {
        console.error('Authentication response is null or undefined');
        throw new Error('Authentication failed: Invalid response from server');
      }

      const userInfo = await getStoredUserInfo();

      if (!userInfo) {
        console.error('User information not found after authentication');
        throw new Error('Authentication failed: User information not available');
      }

      userName!.textContent = userInfo.username;
      accountId!.textContent = userInfo.userId;

      loginState!.style.display = 'none';
      authenticatedState!.style.display = 'block';

      usernameInput.value = '';
      passwordInput.value = '';
    } catch (error) {
      console.error('Login error:', error);
      loginError!.textContent = error instanceof Error ? error.message : 'Authentication failed';
      loginError!.style.display = 'block';
    } finally {
      loginBtn!.textContent = 'Login';
      loginBtn!.removeAttribute('disabled');
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      logoutBtn!.setAttribute('disabled', 'true');

      await logout();

      loginState!.style.display = 'block';
      authenticatedState!.style.display = 'none';

      transactionsContainer!.style.display = 'none';

      transactionsList!.innerHTML = '';
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logoutBtn!.removeAttribute('disabled');
    }
  }

  async function handleFetchTransactions(): Promise<void> {
    console.log('[handleFetchTransactions] Transaction fetch button clicked');
    try {
      console.log('[handleFetchTransactions] Disabling fetch button and showing loading state');
      fetchTransactionsBtn!.setAttribute('disabled', 'true');
      fetchTransactionsBtn!.textContent = 'Fetching...';

      console.log('[handleFetchTransactions] Getting current user info for context');
      const userInfo = await getStoredUserInfo();
      console.log('[handleFetchTransactions] Current user context:', userInfo ? 
        { userId: userInfo.userId, username: userInfo.username } : 'No user info available');

      console.log('[handleFetchTransactions] Calling fetchTransactions API');
      const startTime = performance.now();
      const transactions = await fetchTransactions();
      const endTime = performance.now();
      console.log(`[handleFetchTransactions] fetchTransactions completed in ${(endTime - startTime).toFixed(2)}ms`);

      console.log('[handleFetchTransactions] Clearing previous transactions list');
      transactionsList!.innerHTML = '';

      if (!transactions) {
        console.error('[handleFetchTransactions] Transactions array is null or undefined');
        const errorElement = document.createElement('div');
        errorElement.className = 'transaction-item';
        errorElement.textContent = 'Failed to retrieve transactions';
        transactionsList!.appendChild(errorElement);
        return;
      }

      console.log(`[handleFetchTransactions] Received ${transactions.length} transactions`);
      if (transactions.length > 0) {
        console.log('[handleFetchTransactions] First transaction sample:', transactions[0]);
        if (transactions.length > 1) {
          console.log('[handleFetchTransactions] Last transaction sample:', transactions[transactions.length - 1]);
        }
      }

      if (transactions.length === 0) {
        console.log('[handleFetchTransactions] No transactions found, displaying empty state');
        const noTransactionsElement = document.createElement('div');
        noTransactionsElement.className = 'transaction-item';
        noTransactionsElement.textContent = 'No transactions found';
        transactionsList!.appendChild(noTransactionsElement);
      } else {
        console.log('[handleFetchTransactions] Adding transactions to UI list');
        transactions.forEach((transaction, index) => {
          console.log(`[handleFetchTransactions] Processing transaction ${index + 1}/${transactions.length}`);
          addTransactionToList(transaction);
        });
        console.log('[handleFetchTransactions] All transactions added to UI');
      }

      console.log('[handleFetchTransactions] Displaying transactions container');
      transactionsContainer!.style.display = 'block';
    } catch (error) {
      console.error('[handleFetchTransactions] Error fetching transactions:', error);
      if (error instanceof Error) {
        console.error('[handleFetchTransactions] Error details:', { 
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      }

      console.log('[handleFetchTransactions] Creating error UI element');
      const errorElement = document.createElement('div');
      errorElement.className = 'transaction-item';
      errorElement.textContent = error instanceof Error ? error.message : 'Failed to fetch transactions';

      console.log('[handleFetchTransactions] Clearing transactions list and showing error');
      transactionsList!.innerHTML = '';
      transactionsList!.appendChild(errorElement);

      transactionsContainer!.style.display = 'block';
    } finally {
      console.log('[handleFetchTransactions] Resetting fetch button state');
      fetchTransactionsBtn!.removeAttribute('disabled');
      fetchTransactionsBtn!.textContent = 'Fetch Transactions';
      console.log('[handleFetchTransactions] Transaction fetch process complete');
    }
  }

  function addTransactionToList(transaction: Transaction): void {
    console.log('[addTransactionToList] Adding transaction to UI:', transaction.id);

    if (!transaction) {
      console.error('[addTransactionToList] Transaction is null or undefined');
      return;
    }

    console.log('[addTransactionToList] Creating transaction UI element');
    const transactionElement = document.createElement('div');
    transactionElement.className = 'transaction-item';

    console.log('[addTransactionToList] Setting description:', transaction.description || 'No description');
    const descriptionElement = document.createElement('div');
    descriptionElement.textContent = transaction.description || 'No description';

    const amount = typeof transaction.amount === 'number' ? transaction.amount : 0;
    console.log('[addTransactionToList] Setting amount:', amount, transaction.currency || 'Unknown');
    const amountElement = document.createElement('div');
    amountElement.className = `transaction-amount ${amount >= 0 ? 'positive' : 'negative'}`;
    amountElement.textContent = `${amount >= 0 ? '+' : ''}${amount} ${transaction.currency || 'Unknown'}`;

    const dateElement = document.createElement('div');
    dateElement.className = 'transaction-date';
    try {
      const formattedDate = transaction.date ? new Date(transaction.date).toLocaleString() : 'Unknown date';
      console.log('[addTransactionToList] Setting date:', formattedDate, 'from', transaction.date);
      dateElement.textContent = formattedDate;
    } catch (error) {
      console.error('[addTransactionToList] Error formatting date:', error);
      console.error('[addTransactionToList] Original date value:', transaction.date);
      dateElement.textContent = 'Invalid date';
    }

    console.log('[addTransactionToList] Assembling transaction UI element');
    transactionElement.appendChild(descriptionElement);
    transactionElement.appendChild(amountElement);
    transactionElement.appendChild(dateElement);

    console.log('[addTransactionToList] Adding transaction to list');
    transactionsList!.appendChild(transactionElement);
    console.log('[addTransactionToList] Transaction added successfully');
  }
}
