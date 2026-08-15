// ============================================================
//  dashboard/app.js — Admin Dashboard Frontend Logic
//  All API calls go through the backend (never touch DB directly)
// ============================================================

const API_BASE = '/api';
let jwtToken = null;
let currentTab = 'overview';
let usersPage = 0;
let txPage = 0;
let gamesPage = 0;
const PAGE_SIZE = 50;
let selectedUserId = null;

// ---- AUTH ----
async function doLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Login failed';
      return false;
    }
    jwtToken = data.token;
    localStorage.setItem('admin_token', jwtToken);
    showMainApp();
    loadAll();
  } catch (e) {
    errEl.textContent = 'Connection error. Is the server running?';
  }
  return false;
}

function doLogout() {
  jwtToken = null;
  localStorage.removeItem('admin_token');
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginForm').reset();
}

// Check for stored token on load
(function checkStoredToken() {
  const stored = localStorage.getItem('admin_token');
  if (stored) {
    jwtToken = stored;
    // Verify token
    fetch(`${API_BASE}/auth/verify`, {
      headers: { 'Authorization': `Bearer ${jwtToken}` }
    }).then(r => {
      if (r.ok) { showMainApp(); loadAll(); }
      else { localStorage.removeItem('admin_token'); }
    }).catch(() => {});
  }
})();

function showMainApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
}

// ---- API HELPER ----
async function apiCall(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwtToken}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (res.status === 401) {
    doLogout();
    return null;
  }
  return res.json();
}

// ---- TABS ----
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');

  if (tab === 'overview') { loadStats(); loadPending(); }
  if (tab === 'users') loadUsers();
  if (tab === 'wallet') loadPending();
  if (tab === 'transactions') loadTransactions();
  if (tab === 'games') loadGames();
}

// ---- TOAST ----
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function fmtMoney(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString() + ' Birr';
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function fmtShortDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

// ---- LOAD ALL ----
function loadAll() {
  loadStats();
  loadUsers();
  loadPending();
  loadTransactions();
  loadGames();
}

// ---- STATS ----
async function loadStats() {
  try {
    const stats = await apiCall('GET', '/users/stats/dashboard');
    if (!stats) return;
    document.getElementById('statUsers').textContent = stats.totalUsers.toLocaleString();
    document.getElementById('statBalance').textContent = fmtMoney(stats.totalBalance);
    document.getElementById('statDeposits').textContent = fmtMoney(stats.totalDeposits);
    document.getElementById('statWithdrawals').textContent = fmtMoney(stats.totalWithdrawals);
    document.getElementById('statGamesToday').textContent = stats.gamesToday.toLocaleString();
    document.getElementById('statActive').textContent = stats.activeUsers.toLocaleString();
    document.getElementById('statBlocked').textContent = stats.blockedUsers.toLocaleString();
    document.getElementById('statPendingDep').textContent = stats.pendingDeposits.toLocaleString();
    document.getElementById('statPendingWd').textContent = stats.pendingWithdrawals.toLocaleString();
  } catch (e) { console.error('Stats error:', e); }
}

// ---- USERS ----
async function loadUsers() {
  const search = document.getElementById('userSearch').value.trim();
  const offset = usersPage * PAGE_SIZE;
  try {
    const data = await apiCall('GET', `/users?limit=${PAGE_SIZE}&offset=${offset}&search=${encodeURIComponent(search)}`);
    if (!data) return;
    const tbody = document.getElementById('usersTableBody');
    if (data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="12" class="muted">No users found</td></tr>';
    } else {
      tbody.innerHTML = data.users.map(u => `
        <tr>
          <td>${u.user_id}</td>
          <td>${u.username ? '@' + u.username : '—'}</td>
          <td>${u.display_name || '—'}</td>
          <td><strong>${fmtMoney(u.balance)}</strong></td>
          <td>${fmtMoney(u.total_deposited)}</td>
          <td>${fmtMoney(u.total_withdrawn)}</td>
          <td class="amt-positive">${fmtMoney(u.total_winnings)}</td>
          <td class="amt-negative">${fmtMoney(u.total_losses)}</td>
          <td>${u.games_played || 0}</td>
          <td><span class="badge ${u.status === 'active' ? 'badge-active' : 'badge-blocked'}">${u.status}</span></td>
          <td>${fmtShortDate(u.created_at)}</td>
          <td><button class="btn-action small" onclick="openUserModal(${u.user_id})">View</button></td>
        </tr>
      `).join('');
    }
    document.getElementById('usersPageInfo').textContent = `Page ${usersPage + 1} (${data.total} total)`;
    document.getElementById('usersPrev').disabled = usersPage === 0;
    document.getElementById('usersNext').disabled = (usersPage + 1) * PAGE_SIZE >= data.total;
  } catch (e) { console.error('Users error:', e); }
}

function searchUsers() {
  usersPage = 0;
  loadUsers();
}

// ---- USER MODAL ----
async function openUserModal(userId) {
  selectedUserId = userId;
  try {
    const data = await apiCall('GET', `/users/${userId}`);
    if (!data) return;
    const u = data.user;
    document.getElementById('modalUserTitle').textContent = `User: ${u.display_name || u.username || u.user_id}`;
    document.getElementById('modalUserId').textContent = u.user_id;
    document.getElementById('modalUsername').textContent = u.username ? '@' + u.username : '—';
    document.getElementById('modalDisplayName').textContent = u.display_name || '—';
    document.getElementById('modalBalance').textContent = fmtMoney(u.balance);
    document.getElementById('modalCoins').textContent = u.coins || 0;
    document.getElementById('modalDeposited').textContent = fmtMoney(u.total_deposited);
    document.getElementById('modalWithdrawn').textContent = fmtMoney(u.total_withdrawn);
    document.getElementById('modalWinnings').textContent = fmtMoney(u.total_winnings);
    document.getElementById('modalLosses').textContent = fmtMoney(u.total_losses);
    document.getElementById('modalGames').textContent = u.games_played || 0;
    document.getElementById('modalStatus').innerHTML = `<span class="badge ${u.status === 'active' ? 'badge-active' : 'badge-blocked'}">${u.status}</span>`;
    document.getElementById('modalJoined').textContent = fmtDate(u.created_at);

    // Block/unblock button
    const btnBlock = document.getElementById('btnBlockUnblock');
    if (u.status === 'active') {
      btnBlock.textContent = '🚫 Block User';
      btnBlock.className = 'btn-action red';
    } else {
      btnBlock.textContent = '✅ Unblock User';
      btnBlock.className = 'btn-action green';
    }

    // Transactions
    const txBody = document.getElementById('modalTxTable');
    if (data.transactions && data.transactions.length > 0) {
      txBody.innerHTML = data.transactions.map(t => {
        const amt = parseFloat(t.amount);
        const sign = amt >= 0 ? '+' : '';
        const cls = amt >= 0 ? 'amt-positive' : 'amt-negative';
        return `<tr>
          <td>${fmtDate(t.created_at)}</td>
          <td>${t.type}</td>
          <td class="${cls}">${sign}${amt}</td>
          <td>${t.balance_after}</td>
          <td>${t.description || '—'}</td>
        </tr>`;
      }).join('');
    } else {
      txBody.innerHTML = '<tr><td colspan="5" class="muted">No transactions</td></tr>';
    }

    // Games
    const gameBody = document.getElementById('modalGameTable');
    if (data.games && data.games.length > 0) {
      gameBody.innerHTML = data.games.map(g => {
        const resultBadge = g.result === 'win_1st' ? '<span class="badge badge-win">🥇 1st</span>'
          : g.result === 'win_2nd' ? '<span class="badge badge-win">🥈 2nd</span>'
          : g.result === 'loss' ? '<span class="badge badge-loss">❌ Lost</span>'
          : `<span class="badge badge-pending">${g.result}</span>`;
        return `<tr>
          <td>${fmtDate(g.created_at)}</td>
          <td>Table ${g.table_id + 1}</td>
          <td>${fmtMoney(g.entry_fee)}</td>
          <td>${resultBadge}</td>
          <td class="amt-positive">${fmtMoney(g.winnings)}</td>
        </tr>`;
      }).join('');
    } else {
      gameBody.innerHTML = '<tr><td colspan="5" class="muted">No games</td></tr>';
    }

    hideForms();
    document.getElementById('userModal').classList.remove('hidden');
  } catch (e) { showToast('Error loading user: ' + e.message, 'error'); }
}

function closeModal() {
  document.getElementById('userModal').classList.add('hidden');
  selectedUserId = null;
}

function showAddBalance() {
  hideForms();
  document.getElementById('addBalanceForm').classList.remove('hidden');
}
function showRemoveBalance() {
  hideForms();
  document.getElementById('removeBalanceForm').classList.remove('hidden');
}
function hideForms() {
  document.getElementById('addBalanceForm').classList.add('hidden');
  document.getElementById('removeBalanceForm').classList.add('hidden');
}

async function submitAddBalance() {
  const amount = parseFloat(document.getElementById('addAmount').value);
  const reason = document.getElementById('addReason').value.trim();
  if (!amount || amount <= 0) { showToast('Enter valid amount', 'error'); return; }
  if (!reason) { showToast('Reason is required', 'error'); return; }
  try {
    const result = await apiCall('POST', `/wallet/${selectedUserId}/add`, { amount, reason });
    if (result && result.success) {
      showToast(`Added ${fmtMoney(amount)} to user ${selectedUserId}`);
      hideForms();
      openUserModal(selectedUserId);
      loadStats();
    } else {
      showToast(result?.error || 'Failed', 'error');
    }
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function submitRemoveBalance() {
  const amount = parseFloat(document.getElementById('removeAmount').value);
  const reason = document.getElementById('removeReason').value.trim();
  if (!amount || amount <= 0) { showToast('Enter valid amount', 'error'); return; }
  if (!reason) { showToast('Reason is required', 'error'); return; }
  try {
    const result = await apiCall('POST', `/wallet/${selectedUserId}/remove`, { amount, reason });
    if (result && result.success) {
      showToast(`Removed ${fmtMoney(amount)} from user ${selectedUserId}`);
      hideForms();
      openUserModal(selectedUserId);
      loadStats();
    } else {
      showToast(result?.error || 'Failed', 'error');
    }
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function toggleBlock() {
  if (!selectedUserId) return;
  const user = await apiCall('GET', `/users/${selectedUserId}`);
  if (!user) return;
  const isBlocked = user.user.status === 'blocked';
  const endpoint = isBlocked ? 'unblock' : 'block';
  try {
    const result = await apiCall('POST', `/users/${selectedUserId}/${endpoint}`);
    if (result && result.success) {
      showToast(`User ${isBlocked ? 'unblocked' : 'blocked'}`);
      openUserModal(selectedUserId);
      loadStats();
      loadUsers();
    } else {
      showToast(result?.error || 'Failed', 'error');
    }
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ---- PENDING DEPOSITS & WITHDRAWALS ----
async function loadPending() {
  try {
    const [deps, wds] = await Promise.all([
      apiCall('GET', '/wallet/deposits/pending'),
      apiCall('GET', '/wallet/withdrawals/pending'),
    ]);
    if (!deps && !wds) return;

    // Deposits table (wallet tab)
    const depBody = document.getElementById('pendingDepositsTable');
    if (deps && deps.deposits.length > 0) {
      depBody.innerHTML = deps.deposits.map(d => `
        <tr>
          <td>${d.id}</td>
          <td>${d.display_name || d.username || d.user_id}</td>
          <td class="amt-positive">${fmtMoney(d.amount)}</td>
          <td>${fmtDate(d.created_at)}</td>
          <td>
            <button class="btn-action green small" onclick="approveDeposit(${d.id})">✅ Approve</button>
            <button class="btn-action red small" onclick="rejectDeposit(${d.id})">❌ Reject</button>
          </td>
        </tr>
      `).join('');
    } else {
      depBody.innerHTML = '<tr><td colspan="5" class="muted">No pending deposits</td></tr>';
    }

    // Withdrawals table
    const wdBody = document.getElementById('pendingWithdrawalsTable');
    if (wds && wds.withdrawals.length > 0) {
      wdBody.innerHTML = wds.withdrawals.map(w => `
        <tr>
          <td>${w.id}</td>
          <td>${w.display_name || w.username || w.user_id}</td>
          <td class="amt-negative">${fmtMoney(w.amount)}</td>
          <td>${fmtDate(w.created_at)}</td>
          <td>
            <button class="btn-action green small" onclick="approveWithdrawal(${w.id})">✅ Approve</button>
            <button class="btn-action red small" onclick="rejectWithdrawal(${w.id})">↩️ Reject</button>
          </td>
        </tr>
      `).join('');
    } else {
      wdBody.innerHTML = '<tr><td colspan="5" class="muted">No pending withdrawals</td></tr>';
    }

    // Overview pending container
    const pendCont = document.getElementById('pendingContainer');
    let html = '';
    if (deps && deps.deposits.length > 0) {
      html += '<div class="wallet-section"><h3>⏳ Pending Deposits</h3><div class="table-wrap"><table class="data-table small"><thead><tr><th>User</th><th>Amount</th><th>Action</th></tr></thead><tbody>';
      deps.deposits.slice(0, 5).forEach(d => {
        html += `<tr><td>${d.display_name || d.user_id}</td><td class="amt-positive">${fmtMoney(d.amount)}</td><td><button class="btn-action green small" onclick="approveDeposit(${d.id})">✅</button> <button class="btn-action red small" onclick="rejectDeposit(${d.id})">❌</button></td></tr>`;
      });
      html += '</tbody></table></div></div>';
    }
    if (wds && wds.withdrawals.length > 0) {
      html += '<div class="wallet-section"><h3>⏳ Pending Withdrawals</h3><div class="table-wrap"><table class="data-table small"><thead><tr><th>User</th><th>Amount</th><th>Action</th></tr></thead><tbody>';
      wds.withdrawals.slice(0, 5).forEach(w => {
        html += `<tr><td>${w.display_name || w.user_id}</td><td class="amt-negative">${fmtMoney(w.amount)}</td><td><button class="btn-action green small" onclick="approveWithdrawal(${w.id})">✅</button> <button class="btn-action red small" onclick="rejectWithdrawal(${w.id})">↩️</button></td></tr>`;
      });
      html += '</tbody></table></div></div>';
    }
    if (!html) html = '<p class="muted">No pending requests 🎉</p>';
    pendCont.innerHTML = html;

  } catch (e) { console.error('Pending error:', e); }
}

async function approveDeposit(id) {
  const note = prompt('Admin note (optional):', 'Approved');
  if (note === null) return;
  try {
    const result = await apiCall('POST', `/wallet/deposits/${id}/approve`, { note });
    if (result && result.success) {
      showToast('Deposit approved!');
      loadPending();
      loadStats();
    } else { showToast(result?.error || 'Failed', 'error'); }
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function rejectDeposit(id) {
  const note = prompt('Reason for rejection:', 'Rejected');
  if (note === null) return;
  try {
    const result = await apiCall('POST', `/wallet/deposits/${id}/reject`, { note });
    if (result && result.success) {
      showToast('Deposit rejected');
      loadPending();
      loadStats();
    } else { showToast(result?.error || 'Failed', 'error'); }
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function approveWithdrawal(id) {
  const note = prompt('Admin note (optional):', 'Approved - sent');
  if (note === null) return;
  try {
    const result = await apiCall('POST', `/wallet/withdrawals/${id}/approve`, { note });
    if (result && result.success) {
      showToast('Withdrawal approved!');
      loadPending();
      loadStats();
    } else { showToast(result?.error || 'Failed', 'error'); }
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function rejectWithdrawal(id) {
  const note = prompt('Reason for rejection (funds will be refunded):', 'Rejected - refunded');
  if (note === null) return;
  try {
    const result = await apiCall('POST', `/wallet/withdrawals/${id}/reject`, { note });
    if (result && result.success) {
      showToast('Withdrawal rejected & refunded');
      loadPending();
      loadStats();
    } else { showToast(result?.error || 'Failed', 'error'); }
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ---- TRANSACTIONS ----
async function loadTransactions() {
  const offset = txPage * PAGE_SIZE;
  try {
    const data = await apiCall('GET', `/transactions?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!data) return;
    const tbody = document.getElementById('txTableBody');
    if (data.transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No transactions</td></tr>';
    } else {
      tbody.innerHTML = data.transactions.map(t => {
        const amt = parseFloat(t.amount);
        const sign = amt >= 0 ? '+' : '';
        const cls = amt >= 0 ? 'amt-positive' : 'amt-negative';
        const adminTag = t.admin_action ? ' 🔐' : '';
        return `<tr>
          <td>${fmtDate(t.created_at)}</td>
          <td>${t.display_name || t.username || t.user_id}</td>
          <td>${t.type}</td>
          <td class="${cls}">${sign}${amt}</td>
          <td>${t.balance_after}</td>
          <td>${t.description || '—'}</td>
          <td>${adminTag}</td>
        </tr>`;
      }).join('');
    }
    document.getElementById('txPageInfo').textContent = `Page ${txPage + 1}`;
    document.getElementById('txPrev').disabled = txPage === 0;
    document.getElementById('txNext').disabled = data.transactions.length < PAGE_SIZE;
  } catch (e) { console.error('TX error:', e); }
}

// ---- GAMES ----
async function loadGames() {
  const offset = gamesPage * PAGE_SIZE;
  try {
    const data = await apiCall('GET', `/games?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!data) return;
    const tbody = document.getElementById('gamesTableBody');
    if (data.games.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No games</td></tr>';
    } else {
      tbody.innerHTML = data.games.map(g => {
        const resultBadge = g.result === 'win_1st' ? '<span class="badge badge-win">🥇 1st</span>'
          : g.result === 'win_2nd' ? '<span class="badge badge-win">🥈 2nd</span>'
          : g.result === 'loss' ? '<span class="badge badge-loss">❌ Lost</span>'
          : `<span class="badge badge-pending">${g.result}</span>`;
        return `<tr>
          <td>${fmtDate(g.created_at)}</td>
          <td>${g.display_name || g.username || g.user_id}</td>
          <td>Table ${g.table_id + 1}</td>
          <td>${fmtMoney(g.entry_fee)}</td>
          <td>${resultBadge}</td>
          <td class="amt-positive">${fmtMoney(g.winnings)}</td>
          <td>${g.cards_picked || 0}</td>
        </tr>`;
      }).join('');
    }
    document.getElementById('gamesPageInfo').textContent = `Page ${gamesPage + 1}`;
    document.getElementById('gamesPrev').disabled = gamesPage === 0;
    document.getElementById('gamesNext').disabled = data.games.length < PAGE_SIZE;
  } catch (e) { console.error('Games error:', e); }
}
