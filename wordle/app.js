/* global SAFRAN_WORDLE */
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
};

const statusRank = { absent: 1, present: 2, correct: 3 };
const emoji = { correct: '🟩', present: '🟨', absent: '⬜' };
const todayKey = new Date().toISOString().slice(0, 10);
const startDate = new Date(`${SAFRAN_WORDLE.startDate}T00:00:00Z`);
const today = new Date(`${todayKey}T00:00:00Z`);
const dayIndex = Math.max(0, Math.floor((today - startDate) / 86400000));
const entry = SAFRAN_WORDLE.words[dayIndex % SAFRAN_WORDLE.words.length];
const answer = entry.word.toUpperCase();
const length = answer.length;

const els = {
  grid: document.getElementById('grid'),
  keyboard: document.getElementById('keyboard'),
  message: document.getElementById('message'),
  nameModal: document.getElementById('nameModal'),
  nameForm: document.getElementById('nameForm'),
  playerName: document.getElementById('playerName'),
  dayLabel: document.getElementById('dayLabel'),
  lengthLabel: document.getElementById('lengthLabel'),
  resultPanel: document.getElementById('resultPanel'),
  fastest: document.getElementById('fastest'),
  fewest: document.getElementById('fewest'),
  streaks: document.getElementById('streaks'),
};

function setMessage(text) { els.message.textContent = text; }

function init() {
  els.dayLabel.textContent = `Daily word ${dayIndex + 1}`;
  els.lengthLabel.textContent = `${length} letters`;
  els.grid.style.gridTemplateRows = 'repeat(6, auto)';
  renderGrid();
  renderKeyboard();
  loadLeaderboards();

  if (state.playerName) {
    els.nameModal.classList.add('hidden');
  } else {
    els.playerName.focus();
  }

  els.nameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = els.playerName.value.trim();
    if (!name) return;
    state.playerName = name;
    localStorage.setItem('safranWordleName', name);
    els.nameModal.classList.add('hidden');
  });

  document.addEventListener('keydown', (event) => {
    if (!els.nameModal.classList.contains('hidden')) return;
    if (event.key === 'Enter') submitGuess();
    else if (event.key === 'Backspace') backspace();
    else if (/^[a-z]$/i.test(event.key)) addLetter(event.key.toUpperCase());
  });
}

function renderGrid() {
  els.grid.innerHTML = '';
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

  renderResult(solved, grid);
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

function renderResult(solved, grid) {
  els.resultPanel.classList.remove('hidden');
  els.resultPanel.innerHTML = `
    <h2>${solved ? 'Solved' : 'Today’s Word'}</h2>
    <div class="word">${answer}</div>
    <p class="definition">${entry.definition}</p>
    <a class="link" href="${entry.link}" target="_blank" rel="noopener noreferrer">Safran context</a>
    <h3>Your Grid</h3>
    <div class="share-grid">${grid.join('\n')}</div>
  `;
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
  renderBoard(els.fastest, data.fastest || [], (row) => `${row.playerName} · ${formatTime(row.durationMs)} · ${row.guessesUsed}/6`);
  renderBoard(els.fewest, data.fewest || [], (row) => `${row.playerName} · ${row.guessesUsed}/6 · ${formatTime(row.durationMs)}`);
  renderBoard(els.streaks, data.streaks || [], (row) => `${row.playerName} · ${row.currentStreak} days`);
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

function formatTime(ms) {
  if (ms === null || ms === undefined) return '—';
  const seconds = Math.round(ms / 1000);
  const min = Math.floor(seconds / 60);
  const sec = String(seconds % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

init();
