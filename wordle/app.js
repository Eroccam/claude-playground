/* global SAFRAN_WORDLE */
const DEV_CONFIG = window.SAFRAN_WORDLE_CONFIG || { devMode: false };

const state = {
  playerName: localStorage.getItem('safranWordleName') || '',
  row: 0,
  col: 0,
  guesses: Array.from({ length: 6 }, () => []),
  statuses: Array.from({ length: 6 }, () => []),
  keyStatus: {},
  startedAt: null,
  ended: false,
  resultSent: false,
  lastDurationMs: 0,
  shareGrid: [],
};

const statusRank = { absent: 1, present: 2, correct: 3 };
const emoji = { correct: '\uD83D\uDFE9', present: '\uD83D\uDFE8', absent: '\u2B1C' };
const startDate = new Date(`${SAFRAN_WORDLE.startDate}T00:00:00Z`);

let devOffset = Number(sessionStorage.getItem('safranWordleDevOffset') || 0);
let todayKey = '';
let dayIndex = 0;
let entry = null;
let answer = '';
let length = 0;
let activeScreen = '';

const els = {
  screens: document.querySelectorAll('[data-screen]'),
  grid: document.getElementById('grid'),
  keyboard: document.getElementById('keyboard'),
  message: document.getElementById('message'),
  nameForm: document.getElementById('nameForm'),
  playerName: document.getElementById('playerName'),
  resultWord: document.getElementById('resultWord'),
  definition: document.getElementById('definition'),
  safranLink: document.getElementById('safranLink'),
  completionTime: document.getElementById('completionTime'),
  shareGrid: document.getElementById('shareGrid'),
  copyShare: document.getElementById('copyShare'),
  fastest: document.getElementById('fastest'),
  fewest: document.getElementById('fewest'),
  streaks: document.getElementById('streaks'),
  nextDay: null,
};

function setMessage(text) {
  els.message.textContent = text;
}

function computeDailyContext() {
  const effectiveDate = new Date();
  effectiveDate.setDate(effectiveDate.getDate() + devOffset);
  todayKey = effectiveDate.toISOString().slice(0, 10);

  const today = new Date(`${todayKey}T00:00:00Z`);
  dayIndex = Math.max(0, Math.floor((today - startDate) / 86400000));
  entry = SAFRAN_WORDLE.words[dayIndex % SAFRAN_WORDLE.words.length];
  answer = entry.word.toUpperCase();
  length = answer.length;
}

function init() {
  computeDailyContext();
  resetBoard();
  renderGrid();
  renderKeyboard();
  wireEvents();

  if (DEV_CONFIG.devMode) {
    createDevControls();
  }

  showScreen(state.playerName ? 'game' : 'identity');
}

function wireEvents() {
  els.nameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = els.playerName.value.trim();
    if (!name) return;
    state.playerName = name;
    localStorage.setItem('safranWordleName', name);
    showScreen('game');
  });

  els.copyShare.addEventListener('click', async () => {
    const text = buildShareText();
    try {
      await navigator.clipboard.writeText(text);
      els.copyShare.textContent = 'Copied';
      window.setTimeout(() => { els.copyShare.textContent = 'Share / Copy'; }, 1500);
    } catch {
      setMessage('Copy unavailable.');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (activeScreen !== 'game' || !state.playerName) return;
    if (event.key === 'Enter') submitGuess();
    else if (event.key === 'Backspace') backspace();
    else if (/^[a-z]$/i.test(event.key)) addLetter(event.key.toUpperCase());
  });
}

function createDevControls() {
  els.nextDay = document.createElement('button');
  els.nextDay.id = 'nextDay';
  els.nextDay.className = 'dev-next';
  els.nextDay.type = 'button';
  els.nextDay.textContent = 'Next Day';
  els.nextDay.addEventListener('click', goToNextDevDay);
  document.body.appendChild(els.nextDay);
}

function goToNextDevDay() {
  localStorage.removeItem(`safranWordleComplete:${todayKey}`);
  devOffset += 1;
  sessionStorage.setItem('safranWordleDevOffset', String(devOffset));
  computeDailyContext();
  localStorage.removeItem(`safranWordleComplete:${todayKey}`);
  resetBoard();
  renderGrid();
  renderKeyboard();
  clearLeaderboards();
  showScreen(state.playerName ? 'game' : 'identity');
}

function showScreen(name) {
  activeScreen = name;
  els.screens.forEach((screen) => {
    screen.classList.toggle('hidden', screen.dataset.screen !== name);
  });

  if (name === 'identity') {
    els.playerName.focus();
  }
}

function resetBoard() {
  state.row = 0;
  state.col = 0;
  state.guesses = Array.from({ length: 6 }, () => []);
  state.statuses = Array.from({ length: 6 }, () => []);
  state.keyStatus = {};
  state.startedAt = null;
  state.ended = false;
  state.resultSent = false;
  state.lastDurationMs = 0;
  state.shareGrid = [];
  setMessage('');
}

function renderGrid() {
  els.grid.innerHTML = '';
  els.grid.style.gridTemplateRows = 'repeat(6, auto)';
  for (let r = 0; r < 6; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.gridTemplateColumns = `repeat(${length}, auto)`;
    for (let c = 0; c < length; c++) {
      const tile = document.createElement('div');
      tile.className = `tile ${state.statuses[r][c] || ''}`;
      tile.textContent = state.guesses[r][c] || '';
      row.appendChild(tile);
    }
    els.grid.appendChild(row);
  }
}

function renderKeyboard() {
  els.keyboard.innerHTML = '';
  ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].forEach((letters, idx) => {
    const row = document.createElement('div');
    row.className = 'key-row';
    if (idx === 2) row.appendChild(keyButton('Enter', 'wide', submitGuess));
    [...letters].forEach((letter) => row.appendChild(keyButton(letter, state.keyStatus[letter] || '', () => addLetter(letter))));
    if (idx === 2) row.appendChild(keyButton('Del', 'wide', backspace));
    els.keyboard.appendChild(row);
  });
}

function keyButton(label, cls, onClick) {
  const btn = document.createElement('button');
  btn.className = `key ${cls || ''}`;
  btn.textContent = label;
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

function addLetter(letter) {
  if (state.ended || state.col >= length) return;
  if (!state.startedAt) state.startedAt = Date.now();
  state.guesses[state.row][state.col] = letter;
  state.col += 1;
  renderGrid();
}

function backspace() {
  if (state.ended || state.col <= 0) return;
  state.col -= 1;
  state.guesses[state.row][state.col] = '';
  renderGrid();
}

function scoreGuess(guess) {
  const result = Array(length).fill('absent');
  const remaining = {};
  [...answer].forEach((letter, i) => {
    if (guess[i] === letter) result[i] = 'correct';
    else remaining[letter] = (remaining[letter] || 0) + 1;
  });
  guess.forEach((letter, i) => {
    if (result[i] === 'correct') return;
    if (remaining[letter] > 0) {
      result[i] = 'present';
      remaining[letter] -= 1;
    }
  });
  return result;
}

function submitGuess() {
  if (state.ended) return;
  const guess = state.guesses[state.row];
  if (guess.length !== length || guess.some((letter) => !letter)) {
    setMessage(`Enter ${length} letters.`);
    return;
  }
  if (!state.startedAt) state.startedAt = Date.now();
  const statuses = scoreGuess(guess);
  state.statuses[state.row] = statuses;
  guess.forEach((letter, i) => {
    const next = statuses[i];
    const prev = state.keyStatus[letter];
    if (!prev || statusRank[next] > statusRank[prev]) state.keyStatus[letter] = next;
  });
  renderGrid();
  renderKeyboard();

  const solved = guess.join('') === answer;
  if (solved || state.row === 5) {
    state.ended = true;
    setMessage(solved ? 'Solved.' : 'Come back tomorrow.');
    finishGame(solved);
    return;
  }

  state.row += 1;
  state.col = 0;
  setMessage('');
}

async function finishGame(solved) {
  const durationMs = state.startedAt ? Date.now() - state.startedAt : 0;
  const guessesUsed = solved ? state.row + 1 : 6;
  const grid = state.statuses
    .slice(0, state.row + 1)
    .filter((row) => row.length)
    .map((row) => row.map((status) => emoji[status]).join(''));

  state.lastDurationMs = durationMs;
  state.shareGrid = grid;
  renderResult(grid, durationMs);
  showScreen('results');

  if (state.resultSent) return;
  state.resultSent = true;

  try {
    const res = await fetch('/api/wordle/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: state.playerName,
        dayKey: todayKey,
        word: answer,
        solved,
        guessesUsed,
        durationMs,
        grid,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      renderLeaderboards(data.leaderboards || {});
    } else {
      await loadLeaderboards();
    }
  } catch {
    await loadLeaderboards();
  }
}

function renderResult(grid, durationMs) {
  els.resultWord.textContent = answer;
  els.definition.textContent = entry.definition;
  els.safranLink.href = entry.link;
  els.completionTime.textContent = formatTime(durationMs);
  els.shareGrid.textContent = grid.join('\n');
}

function buildShareText() {
  const guesses = state.ended ? state.row + 1 : 0;
  const score = state.shareGrid.length && state.guesses[state.row].join('') === answer ? guesses : 'X';
  return [
    `Safran Wordle ${todayKey} ${score}/6`,
    '',
    state.shareGrid.join('\n'),
  ].join('\n');
}

async function loadLeaderboards() {
  try {
    const res = await fetch(`/api/wordle/leaderboards?dayKey=${todayKey}`);
    if (!res.ok) throw new Error('leaderboard unavailable');
    const data = await res.json();
    renderLeaderboards(data);
  } catch {
    renderLeaderboards({ fastest: [], fewest: [], streaks: [] });
  }
}

function renderLeaderboards(data) {
  renderBoard(els.fastest, data.fastest || [], (row) => `${row.playerName} - ${formatTime(row.durationMs)} - ${row.guessesUsed}/6`);
  renderBoard(els.fewest, data.fewest || [], (row) => `${row.playerName} - ${row.guessesUsed}/6 - ${formatTime(row.durationMs)}`);
  renderBoard(els.streaks, data.streaks || [], (row) => `${row.playerName} - ${row.currentStreak} days`);
}

function renderBoard(el, rows, label) {
  el.innerHTML = '';
  if (!rows.length) {
    const li = document.createElement('li');
    li.textContent = 'No solves yet';
    el.appendChild(li);
    return;
  }
  rows.slice(0, 5).forEach((row) => {
    const li = document.createElement('li');
    li.textContent = label(row);
    el.appendChild(li);
  });
}

function clearLeaderboards() {
  [els.fastest, els.fewest, els.streaks].forEach((el) => { el.innerHTML = ''; });
}

function formatTime(ms) {
  if (ms === null || ms === undefined) return '-';
  const seconds = Math.round(ms / 1000);
  const min = Math.floor(seconds / 60);
  const sec = String(seconds % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

init();
