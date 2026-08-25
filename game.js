// ============================================================
//  Lucky Card Draw — Telegram Mini App  game.js  v2.0
//  Real-time multi-table gameplay via Socket.IO
//  Players can join & play ALL 5 tables simultaneously
// ============================================================

/* ── Telegram Web App init ── */
const tg = window.Telegram.WebApp;
tg.ready();           // MUST call ready() FIRST before expand()
tg.expand();
tg.enableClosingConfirmation();

/* ── Constants (must match server) ── */
const TABLE_COUNT   = 5;
const CARD_COST     = 10;
const MAX_CARDS     = 5;
const PICK_TIME     = 60;

/* ── Deck (52 cards, same order as server) ── */
const SUITS = ['S','H','D','C'];  // Spades Hearts Diamonds Clubs
const SUIT_SYM = { S:'♠', H:'♥', D:'♦', C:'♣' };
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const DECK  = [];
for (const s of SUITS)
  for (const r of RANKS)
    DECK.push({ id: DECK.length, rank: r, suit: s, label: `${r}${SUIT_SYM[s]}` });

/* ── App state ── */
let me          = null;     // current player DB record
let socket      = null;     // Socket.IO connection
let activeTab   = 'all';   // 'all' | 0-4

// Per-table state (from server)
const tableStates = Array.from({ length: TABLE_COUNT }, (_, i) => ({
  id: i, phase: 'waiting', players: [], timer: PICK_TIME,
  takenCards: [], totalCards: 0, lastResult: null,
}));

// Per-table: set of card IDs the LOCAL player has picked (optimistic UI)
const myPicks = Array.from({ length: TABLE_COUNT }, () => new Set());

// Per-table: last result shown (persisted through phase changes)
const lastResults = Array(TABLE_COUNT).fill(null);

/* ══════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  // Hide win overlay on start (prevent ghost overlay on first open)
  const overlay = document.getElementById('winOverlay');
  if (overlay) overlay.classList.add('hidden');

  setLoading('Verifying identity…');

  // Wait a tick to let Telegram inject initData into the WebApp object
  await new Promise(r => setTimeout(r, 150));

  const userId = getTelegramUserId();
  if (!userId) {
    setLoading('⚠️ Open this app from the Telegram /play command.');
    return;
  }

  // Retry up to 3 times (Render free tier cold-start can be slow)
  let d = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      setLoading(attempt === 1 ? 'Loading your account…' : `Connecting… (attempt ${attempt}/3)`);
      const r = await fetch(
        `/api/miniapp/me?user_id=${userId}&init_data=${encodeURIComponent(tg.initData || '')}`,
        { headers: { 'Cache-Control': 'no-cache' } }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      d = await r.json();
      break; // success
    } catch (e) {
      console.warn(`Attempt ${attempt} failed:`, e.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!d) {
    setLoading('❌ Server unreachable. Please retry in a moment.');
    return;
  }

  if (d.blocked) {
    setLoading('🚫 Your account is blocked. Contact support.');
    return;
  }

  if (!d.user) {
    // Not registered — show registration screen
    showScreen('registerScreen');
    return;
  }

  me = d.user;
  buildUI();
  connectSocket(userId);
});

function getTelegramUserId() {
  // Primary: Telegram injects user data via initDataUnsafe
  if (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
    return tg.initDataUnsafe.user.id;
  }
  // Fallback: URL param (dev / direct link)
  const fromUrl = new URLSearchParams(location.search).get('user_id');
  if (fromUrl) return parseInt(fromUrl);
  return null;
}

/* ══════════════════════════════════════════════════════
   UI BUILD  (runs once after login)
══════════════════════════════════════════════════════ */
function buildUI() {
  // Header
  document.getElementById('headerName').textContent = me.display_name || me.username || 'Player';
  updateBalanceDisplay(me.balance, me.coins);

  // Build table tabs
  const tabsBar = document.getElementById('tabsBar');
  for (let i = 0; i < TABLE_COUNT; i++) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.id = `tab-btn-${i}`;
    btn.innerHTML = `<span class="phase-dot waiting" id="dot-${i}"></span>Table ${i + 1}`;
    btn.onclick = () => switchTab(i);
    tabsBar.appendChild(btn);
  }

  // Build per-table panels
  const container = document.getElementById('tablesContainer');
  for (let i = 0; i < TABLE_COUNT; i++) {
    const div = document.createElement('div');
    div.className = 'table-panel';
    div.id = `panel-${i}`;
    div.innerHTML = buildTablePanelHTML(i);
    container.appendChild(div);
  }

  // Set the "all tables" panel to flex and tab container to relative
  const panelAll = document.getElementById('panel-all');
  panelAll.style.display = 'block';

  showScreen('mainScreen');
}

function buildTablePanelHTML(i) {
  return `
  <!-- STATUS BAR -->
  <div class="table-status-bar">
    <div>
      <div class="table-name">🃏 Table ${i + 1} <span class="phase-dot waiting" id="sdot-${i}"></span></div>
      <div class="table-meta">
        <span>👥 <span id="pcount-${i}">0</span> players</span>
        <span>🃏 <span id="ccount-${i}">0</span> cards</span>
      </div>
    </div>
    <span class="phase-label waiting" id="phase-lbl-${i}">Waiting</span>
  </div>

  <!-- BALANCE BAR -->
  <div class="balance-bar">
    <span class="balance-bar-label">Your balance</span>
    <span class="balance-bar-val" id="bal-${i}">—</span>
  </div>

  <!-- ACTIONS -->
  <div class="table-actions" id="actions-${i}"></div>

  <!-- TIMER -->
  <div id="timer-wrap-${i}" class="timer-wrap hidden">
    <div class="timer-label">
      <span>⏱ Pick your cards</span>
      <span class="timer-val" id="timer-val-${i}">60s</span>
    </div>
    <div class="timer-bar-track">
      <div class="timer-bar-fill" id="timer-bar-${i}" style="width:100%"></div>
    </div>
  </div>

  <!-- PLAYERS LIST -->
  <div id="players-sec-${i}" class="players-section hidden">
    <div class="section-title">Players at this table</div>
    <div class="players-list" id="players-list-${i}"></div>
  </div>

  <!-- WAITING -->
  <div id="waiting-${i}" class="waiting-section hidden">
    <div class="waiting-icon">⏳</div>
    <div class="waiting-text">Waiting for more players…<br>Need at least 2 to start</div>
    <div class="waiting-players">In lobby: <strong id="w-count-${i}">1</strong></div>
  </div>

  <!-- LIVE ANIMATION (reveal / drawing / spectator) -->
  <div id="live-${i}" class="live-section hidden">
    <div class="live-anim" id="live-anim-${i}">🎰</div>
    <div class="live-text" id="live-text-${i}">Please wait…</div>
    <div class="live-sub"  id="live-sub-${i}"></div>
  </div>

  <!-- CARD PICKING AREA -->
  <div id="cards-${i}" class="card-grid-wrap hidden">
    <div class="card-grid-header">
      <div class="section-title">Pick cards · ${CARD_COST} Birr each</div>
      <span class="pick-cost-badge" id="cost-badge-${i}">0 Birr</span>
    </div>
    <div class="my-picks-row">
      <span>Picked:</span>
      <div class="my-picks-cards" id="my-picks-cards-${i}"></div>
      <span class="picks-counter" id="picks-counter-${i}">0 / 5</span>
    </div>
    <div class="card-grid" id="card-grid-${i}"></div>
  </div>

  <!-- RESULT -->
  <div id="result-${i}" class="result-section hidden"></div>
  `;
}

/* ══════════════════════════════════════════════════════
   SOCKET.IO
══════════════════════════════════════════════════════ */
function connectSocket(userId) {
  const script = document.createElement('script');
  script.src   = '/socket.io/socket.io.js';
  script.onload = () => {
    socket = io('/', {
      query: { user_id: userId, init_data: tg.initData || '' },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      socket.emit('join_miniapp', { user_id: userId });
    });

    socket.on('disconnect', () => showToast('⚠️ Reconnecting…', ''));

    // All table states on first connect
    socket.on('all_tables', (states) => {
      states.forEach(s => applyTableState(s));
      renderAllOverview();
    });

    // Single table update
    socket.on('table_state', (s) => {
      applyTableState(s);
      renderOverviewCard(s.id);
      updateTabDot(s.id);
    });

    // Personal balance change
    socket.on('balance_update', ({ balance, coins }) => {
      if (me) { me.balance = balance; me.coins = coins; }
      updateBalanceDisplay(balance, coins);
    });

    // Round result (personal)
    socket.on('round_result', (d) => {
      lastResults[d.tableId] = d;
      renderResult(d.tableId, d);
      maybeShowWinOverlay(d);
    });

    // Card pick ACK (server rejected)
    socket.on('pick_ack', ({ error, tableId, cardId }) => {
      if (error) {
        showToast('❌ ' + error, 'error');
        if (cardId !== undefined) myPicks[tableId].delete(cardId);
        const s = tableStates[tableId];
        const myP = getMyPlayer(s);
        renderCardGrid(tableId, s, myP);
      }
    });

    socket.on('join_ack', ({ error, tableId, balance, coins }) => {
      if (error) { showToast('❌ ' + error, 'error'); }
      else {
        showToast(`✅ Joined Table ${tableId + 1}`);
        if (balance !== undefined) updateBalanceDisplay(balance, coins);
        tg.HapticFeedback.impactOccurred('light');
      }
    });

    socket.on('error_msg', ({ message }) => showToast('❌ ' + message, 'error'));
  };

  script.onerror = () => {
    console.warn('Socket.IO unavailable — polling mode');
    startPolling(userId);
  };
  document.head.appendChild(script);
}

/* ══════════════════════════════════════════════════════
   POLLING FALLBACK  (when Socket.IO fails)
══════════════════════════════════════════════════════ */
let _pollTimer = null;
function startPolling(uid) {
  pollTables(uid);
  _pollTimer = setInterval(() => pollTables(uid), 3000);
}

async function pollTables(uid) {
  try {
    const r = await fetch(`/api/miniapp/tables?user_id=${uid}`);
    const d = await r.json();
    if (d.tables) {
      d.tables.forEach(s => applyTableState(s));
      renderAllOverview();
    }
    if (d.balance !== undefined) updateBalanceDisplay(d.balance, d.coins);
    if (d.user) { me = d.user; updateBalanceDisplay(me.balance, me.coins); }
  } catch (_) {}
}

/* ══════════════════════════════════════════════════════
   STATE  →  RENDER
══════════════════════════════════════════════════════ */
function applyTableState(s) {
  tableStates[s.id] = s;
  renderTablePanel(s.id);
  updateTabDot(s.id);
}

// ── Render the "All Tables" overview panel ──
function renderAllOverview() {
  const el = document.getElementById('overviewCards');
  if (!el) return;
  el.innerHTML = '<div class="overview-grid">' +
    tableStates.map(s => buildOverviewCard(s)).join('') +
    '</div>';
}

function renderOverviewCard(i) {
  const el = document.getElementById('overviewCards');
  if (!el) return;
  // Update just that card's HTML inside the grid
  const grid = el.querySelector('.overview-grid');
  if (!grid) { renderAllOverview(); return; }
  const existing = grid.children[i];
  if (!existing) { renderAllOverview(); return; }
  existing.outerHTML = buildOverviewCard(tableStates[i]);
}

function buildOverviewCard(s) {
  const amIn = isPlayerIn(s);
  const result = lastResults[s.id];

  // Phase label text
  const phaseText = {
    waiting: '⏳ Waiting', picking: '🟢 Picking', reveal: '🎰 Revealing',
    drawing: '🎉 Drawing', finished: '✅ Done',
  }[s.phase] || s.phase;

  // Action button
  let actionBtn = '';
  if (amIn) {
    actionBtn = `<button class="ov-action-btn ov-btn-open" onclick="switchTab(${s.id})">Open ▶</button>`;
  } else if (s.phase === 'waiting' || s.phase === 'picking') {
    const canAfford = me && parseFloat(me.balance) >= CARD_COST;
    actionBtn = canAfford
      ? `<button class="ov-action-btn ov-btn-join" onclick="joinTable(${s.id})">Join</button>`
      : `<button class="ov-action-btn ov-btn-wait" disabled>Low Bal.</button>`;
  } else {
    actionBtn = `<button class="ov-action-btn ov-btn-wait" disabled>In Progress</button>`;
  }

  // Last result preview
  let resultPrev = '';
  if (result && result.winner1) {
    resultPrev = `<div class="ov-result-preview">🏆 Last: ${result.winner1.name} (${result.winner1.card}) +${result.prize1st} Birr</div>`;
  }

  const cls = `ov-card${amIn ? ' joined' : ''}${s.phase === 'picking' ? ' picking-phase' : ''}${s.phase === 'finished' ? ' finished-phase' : ''}`;

  return `<div class="${cls}" onclick="switchTab(${s.id})">
    <div class="ov-card-left">
      <div class="ov-table-name">
        <span class="phase-dot ${s.phase}"></span>
        Table ${s.id + 1}
        ${amIn ? '<span class="tab-joined-badge">JOINED</span>' : ''}
      </div>
      <div class="ov-table-meta">
        <span>👥 ${s.players ? s.players.length : 0} players</span>
        <span>🃏 ${s.totalCards || 0} cards</span>
        ${s.phase === 'picking' ? `<span>⏱ ${s.timer || 0}s</span>` : ''}
      </div>
      ${resultPrev}
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
      <span class="ov-phase-label ${s.phase}">${phaseText}</span>
      ${actionBtn}
    </div>
  </div>`;
}

// ── Render individual table panel ──
function renderTablePanel(i) {
  const s = tableStates[i];
  const amIn = isPlayerIn(s);
  const myP  = getMyPlayer(s);

  // Phase label + dot
  const phaseLbl = document.getElementById(`phase-lbl-${i}`);
  const sdot     = document.getElementById(`sdot-${i}`);
  if (phaseLbl) {
    phaseLbl.className = `phase-label ${s.phase}`;
    phaseLbl.textContent = {
      waiting:'Waiting', picking:'🟢 Picking', reveal:'🎰 Reveal',
      drawing:'🎉 Drawing', finished:'✅ Done',
    }[s.phase] || s.phase;
  }
  if (sdot) sdot.className = `phase-dot ${s.phase}`;

  // Counts
  setTxt(`pcount-${i}`, s.players ? s.players.length : 0);
  setTxt(`ccount-${i}`, s.totalCards || 0);

  // Balance
  setTxt(`bal-${i}`, me ? `${parseFloat(me.balance).toFixed(2)} Birr` : '—');

  // Sections
  renderActionsBar(i, s, amIn);
  renderTimerBar(i, s);
  renderPlayersList(i, s);
  renderPhase(i, s, amIn, myP);
}

function renderActionsBar(i, s, amIn) {
  const div = document.getElementById(`actions-${i}`);
  if (!div) return;
  const canAfford = me && parseFloat(me.balance) >= CARD_COST;

  if (!amIn) {
    if (s.phase === 'waiting' || s.phase === 'picking') {
      div.innerHTML = canAfford
        ? `<button class="btn btn-primary btn-full" onclick="joinTable(${i})">▶️ Join Table ${i + 1}</button>`
        : `<button class="btn btn-primary btn-full" disabled>❌ Need ${CARD_COST} Birr to join</button>`;
    } else {
      div.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:0.82rem;padding:6px">Round in progress — join next round</div>`;
    }
  } else {
    // In table
    if (s.phase === 'waiting' || s.phase === 'finished') {
      div.innerHTML = `
        <button class="btn btn-gold btn-full" onclick="startRound(${i})">🚀 ${s.phase==='finished'?'New Round':'Start Round'}</button>
        <button class="btn btn-danger btn-sm" onclick="leaveTable(${i})" style="flex-shrink:0">Leave</button>`;
    } else {
      div.innerHTML = `<div style="text-align:center;color:var(--green);font-size:0.85rem;padding:4px;font-weight:700">✅ You are playing this round</div>`;
    }
  }
}

function renderTimerBar(i, s) {
  const wrap = document.getElementById(`timer-wrap-${i}`);
  if (!wrap) return;
  if (s.phase === 'picking') {
    wrap.classList.remove('hidden');
    setTxt(`timer-val-${i}`, `${s.timer || 0}s`);
    const bar = document.getElementById(`timer-bar-${i}`);
    if (bar) {
      const pct = Math.max(0, ((s.timer || 0) / PICK_TIME) * 100);
      bar.style.width = pct + '%';
      if ((s.timer || 0) <= 10) bar.classList.add('urgent');
      else bar.classList.remove('urgent');
    }
  } else {
    wrap.classList.add('hidden');
  }
}

function renderPlayersList(i, s) {
  const sec  = document.getElementById(`players-sec-${i}`);
  const list = document.getElementById(`players-list-${i}`);
  if (!sec || !list) return;
  if (s.players && s.players.length > 0 && s.phase !== 'waiting') {
    sec.classList.remove('hidden');
    list.innerHTML = s.players.map(p => {
      const isMe = isMine(p);
      return `<div class="player-chip ${isMe ? 'me' : ''}">
        ${isMe ? '⭐' : '👤'} ${p.name}
        ${s.phase === 'picking' ? `<span class="chip-cards">(${p.cardCount || 0} cards)</span>` : ''}
      </div>`;
    }).join('');
  } else {
    sec.classList.add('hidden');
  }
}

function renderPhase(i, s, amIn, myP) {
  const waitEl  = document.getElementById(`waiting-${i}`);
  const liveEl  = document.getElementById(`live-${i}`);
  const cardsEl = document.getElementById(`cards-${i}`);
  const resEl   = document.getElementById(`result-${i}`);

  // Hide all first
  hide(waitEl); hide(liveEl); hide(cardsEl);
  if (s.phase !== 'finished') hide(resEl);

  switch (s.phase) {
    case 'waiting':
      if (amIn && waitEl) {
        show(waitEl);
        setTxt(`w-count-${i}`, s.players ? s.players.length : 0);
      }
      // Clear last result display when back to waiting
      if (resEl) hide(resEl);
      break;

    case 'picking':
      if (amIn && cardsEl) {
        show(cardsEl);
        renderCardGrid(i, s, myP);
      } else if (!amIn && liveEl) {
        show(liveEl);
        setTxt(`live-anim-${i}`, '🃏');
        setTxt(`live-text-${i}`, 'Round in Progress');
        setTxt(`live-sub-${i}`, `${s.players ? s.players.length : 0} players picking • ${s.timer || 0}s left`);
      }
      // Clear old result during new pick phase
      if (resEl) hide(resEl);
      break;

    case 'reveal':
      show(liveEl);
      setTxt(`live-anim-${i}`, '🎰');
      setTxt(`live-text-${i}`, 'Revealing Winner…');
      setTxt(`live-sub-${i}`, '🥁 Drum roll…');
      break;

    case 'drawing':
      show(liveEl);
      setTxt(`live-anim-${i}`, '🎉');
      setTxt(`live-text-${i}`, 'Calculating Prizes!');
      setTxt(`live-sub-${i}`, '🏆 Almost there…');
      break;

    case 'finished':
      if (lastResults[i] && resEl) {
        // Result is already rendered by renderResult() on round_result event
        show(resEl);
      } else if (liveEl) {
        show(liveEl);
        setTxt(`live-anim-${i}`, '✅');
        setTxt(`live-text-${i}`, 'Round Finished');
        setTxt(`live-sub-${i}`, 'Start a new round!');
      }
      break;
  }
}

/* ── Card Grid ── */
function renderCardGrid(i, s, myP) {
  const grid        = document.getElementById(`card-grid-${i}`);
  const picksCards  = document.getElementById(`my-picks-cards-${i}`);
  const counter     = document.getElementById(`picks-counter-${i}`);
  const costBadge   = document.getElementById(`cost-badge-${i}`);
  if (!grid) return;

  const takenSet = new Set(s.takenCards || []);
  const mySet    = myPicks[i];
  const maxCards = myP ? myP.maxCards : (me ? Math.min(MAX_CARDS, Math.floor(parseFloat(me.balance) / CARD_COST)) : 0);

  // My picks row
  if (picksCards) {
    picksCards.innerHTML = mySet.size === 0
      ? '<span style="color:var(--text-muted)">None yet</span>'
      : [...mySet].map(id => `<span class="picked-mini" onclick="unpickCard(${i},${id})" title="Tap to remove">${DECK[id]?.label || id}</span>`).join('');
  }
  if (counter)  counter.textContent  = `${mySet.size} / ${maxCards}`;
  if (costBadge) costBadge.textContent = `${mySet.size * CARD_COST} Birr`;

  // Cards
  grid.innerHTML = DECK.map(card => {
    const isMine   = mySet.has(card.id);
    const isTaken  = takenSet.has(card.id) && !isMine;
    const suitKey  = card.suit;
    let cls        = `card suit-${suitKey} `;
    let handler    = '';

    if (isMine) {
      cls    += 'mine';
      handler = `onclick="unpickCard(${i},${card.id})"`;
    } else if (isTaken) {
      cls    += 'taken';
    } else {
      cls    += 'available';
      if (mySet.size < maxCards)
        handler = `onclick="pickCard(${i},${card.id})"`;
      else
        handler = `onclick="showToast('Max ${maxCards} cards allowed','error')"`;
    }

    return `<div class="${cls}" ${handler}>
      <span class="suit">${SUIT_SYM[card.suit]}</span>
      <span class="rank">${card.rank}</span>
    </div>`;
  }).join('');
}

/* ── Result Panel ── */
function renderResult(tableId, d) {
  const resEl = document.getElementById(`result-${tableId}`);
  if (!resEl) return;
  lastResults[tableId] = d;

  const myPl    = d.players ? d.players.find(p => isMine(p)) : null;
  const myRes   = myPl ? myPl.result : null;

  let banner = '';
  if      (myRes === 'win_1st') banner = `<div class="my-result-banner won">🥇 You won 1st Place! +${d.prize1st} Birr</div>`;
  else if (myRes === 'win_2nd') banner = `<div class="my-result-banner won">🥈 You won 2nd Place! +${d.prize2nd} Birr</div>`;
  else if (myRes === 'loss')    banner = `<div class="my-result-banner lost">Keep it up! +${d.coinsEarned || 2}🪙 coins earned</div>`;

  const w1 = d.winner1, w2 = d.winner2;
  resEl.innerHTML = `
    <div class="result-title">🏆 Round Result — Table ${tableId + 1}</div>
    ${banner}
    <div class="result-winners">
      ${w1 ? `<div class="winner-row first">
        <span class="winner-place">🥇</span>
        <div class="winner-info">
          <div class="winner-name">${w1.name}</div>
          <div class="winner-card">Winning card: ${w1.card}</div>
        </div>
        <div class="winner-prize">+${d.prize1st} Birr</div>
      </div>` : ''}
      ${w2 ? `<div class="winner-row second">
        <span class="winner-place">🥈</span>
        <div class="winner-info">
          <div class="winner-name">${w2.name}</div>
          <div class="winner-card">Winning card: ${w2.card}</div>
        </div>
        <div class="winner-prize">+${d.prize2nd} Birr</div>
      </div>` : ''}
    </div>
    <div class="result-stats">
      <div class="result-stat"><div class="result-stat-val">${d.totalCards || 0}</div><div class="result-stat-label">Cards</div></div>
      <div class="result-stat"><div class="result-stat-val">${d.players ? d.players.length : 0}</div><div class="result-stat-label">Players</div></div>
      <div class="result-stat"><div class="result-stat-val">${(d.prize1st || 0) + (d.prize2nd || 0)}</div><div class="result-stat-label">Paid out</div></div>
      <div class="result-stat"><div class="result-stat-val">+${d.coinsEarned || 2}🪙</div><div class="result-stat-label">Coins</div></div>
    </div>`;
  show(resEl);

  // Clear this round's picks
  myPicks[tableId].clear();
}

function maybeShowWinOverlay(d) {
  const myPl  = d.players ? d.players.find(p => isMine(p)) : null;
  const myRes = myPl ? myPl.result : null;
  if (myRes === 'win_1st' || myRes === 'win_2nd') {
    const is1st = myRes === 'win_1st';
    setTxt('winEmoji',  is1st ? '🥇' : '🥈');
    setTxt('winTitle',  is1st ? 'You Won 1st Place!' : 'You Won 2nd Place!');
    setTxt('winAmount', is1st ? `+${d.prize1st} Birr` : `+${d.prize2nd} Birr`);
    setTxt('winTable',  `Table ${d.tableId + 1}`);
    show(document.getElementById('winOverlay'));
    tg.HapticFeedback.notificationOccurred('success');
    confettiBurst();
  }
}

function closeWinOverlay() {
  hide(document.getElementById('winOverlay'));
}

// ── Tab switching ──
function switchTab(which) {
  activeTab = which;

  // Deactivate all tabs
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.table-panel').forEach(p => p.classList.remove('active'));

  if (which === 'all') {
    document.getElementById('tab-btn-all').classList.add('active');
    document.getElementById('panel-all').classList.remove('hidden');
    document.getElementById('tablesContainer').style.display = 'none';
    // Panel-all is a sibling flex element, ensure it's shown
    document.getElementById('panel-all').style.display = 'block';
    renderAllOverview();
  } else {
    document.getElementById('panel-all').style.display = 'none';
    document.getElementById('tablesContainer').style.display = '';
    const tabBtn = document.getElementById(`tab-btn-${which}`);
    if (tabBtn) tabBtn.classList.add('active');
    const panel = document.getElementById(`panel-${which}`);
    if (panel) panel.classList.add('active');
    renderTablePanel(which);
  }
}

function updateTabDot(i) {
  const s   = tableStates[i];
  const btn = document.getElementById(`tab-btn-${i}`);
  if (!btn) return;

  const amIn = isPlayerIn(s);
  btn.innerHTML = `<span class="phase-dot ${s.phase}"></span>Table ${i + 1}${amIn ? ` <span class="tab-joined-badge">✓</span>` : ''}`;
}

/* ══════════════════════════════════════════════════════
   GAME ACTIONS
══════════════════════════════════════════════════════ */
function joinTable(tableId) {
  if (!me) return;
  if (parseFloat(me.balance) < CARD_COST) {
    showToast(`❌ Need ${CARD_COST} Birr. Use /deposit`, 'error');
    tg.HapticFeedback.notificationOccurred('error');
    return;
  }
  if (socket && socket.connected) {
    socket.emit('join_table', { user_id: me.user_id, table_id: tableId });
  } else {
    apiFetch('/api/miniapp/join', { user_id: me.user_id, table_id: tableId })
      .then(d => {
        if (d.error) showToast('❌ ' + d.error, 'error');
        else { showToast(`✅ Joined Table ${tableId + 1}`); pollTables(me.user_id); }
      });
  }
  // Switch to the table
  setTimeout(() => switchTab(tableId), 200);
  tg.HapticFeedback.impactOccurred('light');
}

function leaveTable(tableId) {
  if (!me) return;
  if (socket && socket.connected) {
    socket.emit('leave_table', { user_id: me.user_id, table_id: tableId });
  } else {
    apiFetch('/api/miniapp/leave', { user_id: me.user_id, table_id: tableId })
      .then(() => pollTables(me.user_id));
  }
  myPicks[tableId].clear();
  tg.HapticFeedback.impactOccurred('light');
}

function startRound(tableId) {
  if (!me) return;
  if (socket && socket.connected) {
    socket.emit('start_round', { user_id: me.user_id, table_id: tableId });
  } else {
    apiFetch('/api/miniapp/start', { user_id: me.user_id, table_id: tableId })
      .then(d => { if (d.error) showToast('❌ ' + d.error, 'error'); });
  }
  tg.HapticFeedback.impactOccurred('medium');
}

function pickCard(tableId, cardId) {
  if (!me) return;
  const s   = tableStates[tableId];
  const myP = getMyPlayer(s);
  const max = myP ? myP.maxCards : Math.min(MAX_CARDS, Math.floor(parseFloat(me.balance) / CARD_COST));

  if (myPicks[tableId].size >= max) {
    showToast(`Max ${max} cards on this table`, 'error');
    tg.HapticFeedback.notificationOccurred('warning');
    return;
  }
  myPicks[tableId].add(cardId);

  // Optimistic render
  renderCardGrid(tableId, s, myP);

  if (socket && socket.connected) {
    socket.emit('pick_card', { user_id: me.user_id, table_id: tableId, card_id: cardId });
  } else {
    apiFetch('/api/miniapp/pick', { user_id: me.user_id, table_id: tableId, card_id: cardId })
      .then(d => { if (d.error) { showToast('❌ ' + d.error, 'error'); myPicks[tableId].delete(cardId); renderCardGrid(tableId, s, myP); } });
  }
  tg.HapticFeedback.impactOccurred('light');
}

function unpickCard(tableId, cardId) {
  if (!me) return;
  if (!myPicks[tableId].has(cardId)) return;
  myPicks[tableId].delete(cardId);

  const s   = tableStates[tableId];
  const myP = getMyPlayer(s);
  renderCardGrid(tableId, s, myP);

  if (socket && socket.connected) {
    socket.emit('unpick_card', { user_id: me.user_id, table_id: tableId, card_id: cardId });
  } else {
    apiFetch('/api/miniapp/unpick', { user_id: me.user_id, table_id: tableId, card_id: cardId });
  }
  tg.HapticFeedback.impactOccurred('light');
}

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */
function isPlayerIn(s) {
  return !!(me && s.players && s.players.some(p => isMine(p)));
}
function isMine(p) {
  return me && String(p.id) === String(me.user_id);
}
function getMyPlayer(s) {
  return me && s.players ? s.players.find(p => isMine(p)) : null;
}

function updateBalanceDisplay(balance, coins) {
  if (me) { me.balance = balance; me.coins = coins; }
  setTxt('headerBalance', parseFloat(balance).toFixed(2));
  setTxt('headerCoins', coins || 0);
  for (let i = 0; i < TABLE_COUNT; i++) {
    setTxt(`bal-${i}`, `${parseFloat(balance).toFixed(2)} Birr`);
  }
}

function apiFetch(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(() => ({}));
}

async function refreshAll() {
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.classList.add('spinning');
  try {
    const uid = me ? me.user_id : getTelegramUserId();
    const r = await fetch(`/api/miniapp/tables?user_id=${uid}`);
    const d = await r.json();
    if (d.tables) {
      d.tables.forEach(s => applyTableState(s));
      renderAllOverview();
    }
    if (d.balance !== undefined) updateBalanceDisplay(d.balance, d.coins);
    if (d.user) { me = d.user; updateBalanceDisplay(me.balance, me.coins); }
    // Re-render current active panel
    if (activeTab !== 'all') renderTablePanel(activeTab);
    else renderAllOverview();
  } catch (_) {}
  setTimeout(() => { if (btn) btn.classList.remove('spinning'); }, 600);
}

function openBot() {
  const user = window.__BOT_USERNAME || 'LuckyCardDrawBot';
  if (tg && tg.openTelegramLink) tg.openTelegramLink(`https://t.me/${user}`);
  else location.href = `https://t.me/${user}`;
}

/* ── DOM helpers ── */
function setTxt(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setLoading(msg) {
  setTxt('loadingMsg', msg);
  showScreen('loadingScreen');
}

let _toastTimer = null;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

/* ── Simple confetti burst ── */
function confettiBurst() {
  const el = document.getElementById('winConfetti');
  if (!el) return;
  const colors = ['#f59e0b','#fcd34d','#10b981','#a855f7','#3b82f6','#ef4444'];
  el.innerHTML = '';
  for (let i = 0; i < 28; i++) {
    const dot = document.createElement('div');
    const angle = (i / 28) * 360;
    const dist  = 60 + Math.random() * 80;
    const color = colors[i % colors.length];
    dot.style.cssText = `
      position:absolute; width:7px; height:7px; border-radius:50%;
      background:${color}; left:50%; top:50%;
      animation: confettiPop${i % 3} 0.8s ease-out forwards;
      transform-origin: 0 0;
      --dx:${Math.cos(angle * Math.PI / 180) * dist}px;
      --dy:${Math.sin(angle * Math.PI / 180) * dist}px;
    `;
    el.appendChild(dot);
  }
  // inject keyframes once
  if (!document.getElementById('confetti-style')) {
    const s = document.createElement('style');
    s.id = 'confetti-style';
    s.textContent = `
      @keyframes confettiPop0{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0}}
      @keyframes confettiPop1{0%{transform:translate(0,0) scale(1.2);opacity:1}100%{transform:translate(calc(var(--dx)*1.2),calc(var(--dy)*0.8)) scale(0);opacity:0}}
      @keyframes confettiPop2{0%{transform:translate(0,0) scale(0.8);opacity:1}100%{transform:translate(calc(var(--dx)*0.8),calc(var(--dy)*1.2)) scale(0);opacity:0}}
    `;
    document.head.appendChild(s);
  }
}
