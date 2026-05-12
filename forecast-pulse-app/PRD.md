# Forecast Pulse — Product Requirements Document

**Product:** Forecast Pulse  
**Owner:** Safran Americas Marketing Team  
**Version:** 1.0  
**Date:** April 2026  
**Status:** Active — Demo Build

---

## 1. Product Overview

Forecast Pulse is an internal prediction markets application for the Safran Americas Marketing team. Participants are allocated a weekly points budget and wager on binary (Yes/No) outcomes tied to real business metrics and local/cultural events. Dynamic odds reflect the collective wisdom of the group in real time. When a market resolves, winners are paid out proportionally from the total pool; losers forfeit their wagered points.

The product serves two purposes:

1. **Engagement tool** — creates a fun, low-stakes way to stay connected to company performance metrics, local Rochester culture, and team sports, using competition and forecasting to drive conversation.
2. **Collective intelligence signal** — the market odds at any given moment represent the team's aggregated belief about an outcome, which can surface alignment or hidden disagreement about business goals before official results are announced.

---

## 2. Goals & Success Metrics

### Primary Goals
- Drive weekly engagement: participants log in at least once per week to review odds and place bets
- Provide a compelling live demo artifact for management presentations
- Surface team sentiment on business goals through prediction market odds

### Success Metrics

| Metric | Target |
|--------|--------|
| Weekly active participants | ≥ 5 of 6 team members |
| Markets resolved per month | 2–4 |
| Average bets placed per market | ≥ 4 |
| Admin time to create a new market | < 2 minutes |
| Demo load time (cold) | < 1 second |

---

## 3. Users & Roles

### 3.1 Participant

Standard team member. Can:
- Browse all active and recently resolved markets
- View live odds and pool totals
- Place one bet per market (Yes or No) while the market is Active
- Track their portfolio: active bets, potential payouts, bet history
- View the leaderboard ranked by total points
- Edit their display nickname and avatar color

**Identity:** Participants are pre-seeded by name. Login requires only selecting a profile — no password. New participants can join by entering their name.

**Initial team roster:**

| Display Name | Login Handle | Starting Color |
|---|---|---|
| Sam Torrey | sam.torrey | Blue `#3b82f6` |
| Benson Pearson | benson.pearson | Green `#22c55e` |
| Cameron Chambers | cameron.chambers | Purple `#7c6ff7` |
| Dylan Panarra | dylan.panarra | Amber `#f59e0b` |
| Cody Mcconnell | cody.mcconnell | Cyan `#06b6d4` |
| Sophie Zangs | sophie.zangs | Fuchsia `#e879f9` |

### 3.2 Admin

Manages the game. Can:
- View all active markets with live odds, pool sizes, and bet counts
- Create new markets (from templates or from scratch)
- Resolve any active market as Yes or No
- Cancel a market (triggers full refunds)
- Simulate bets on behalf of any participant (for demo purposes)
- Trigger a "Simulate Round" that randomizes bets from all users across active markets
- Advance the week (grants weekly point allowances to all participants)
- Reset the entire demo to its original seed state
- View a full participant snapshot (balances, locked points, active bets)

Admin access requires no authentication — the admin login card is available on the login screen.

---

## 4. Feature Specifications

### 4.1 Login Screen

The entry point to the application. Displays:
- Safran wordmark logo
- "Forecast Pulse" product name with current week label
- Two login cards: **Admin** and **Participant**
- On selecting Participant: a user picker grid appears showing all registered participants with their avatar, display name, and total point balance
- A "Join" input field allows a new participant to register by entering their name

### 4.2 Participant Views

#### 4.2.1 Home

Two-column layout:

**Left column — Markets**
- A "This Week's Market" featured card for the most recently created active market
- An "Active Markets" grid listing all remaining active markets
- Each market card shows: question title, Yes/No probability bar, total pool size, bet count, close date, and the participant's own position if they've already bet

**Right column — Sidebar**
- Balance widget: total points, available balance, locked balance, next allowance preview, lifetime won, lifetime lost
- Mini leaderboard: top 5 participants by total points with a link to the full leaderboard

#### 4.2.2 Market Detail

Accessed by clicking any market card. Shows:
- Market status badge (Active / Resolved / Cancelled) and close date
- Market question as the page heading
- Full odds display: Yes/No probability bar, total pool, bet count, Yes multiplier, No multiplier
- Market description and resolution criteria (collapsible cards)
- **If participant has not bet and market is Active:** a full betting form with side selector (Yes/No), amount slider + numeric input, and live payout preview
- **If participant has already bet:** a "Your Position" card showing side, amount, and current potential payout based on live odds
- **If market is Resolved or Cancelled:** a status card with outcome and resolution date

**One bet per market per participant.** Once placed, a bet cannot be changed or cancelled.

#### 4.2.3 Portfolio

A full view of the participant's betting history:
- Summary stats row: active bet count, total points locked, total potential payout
- Active bets table: market, side, amount wagered, potential payout, close date
- Bet history table: past bets showing market, side, amount, outcome (Won/Lost/Refunded), and final payout

#### 4.2.4 Leaderboard

Full ranked table of all participants, sorted by total points (available + locked):
- Rank (with gold/silver/bronze styling for top 3)
- Avatar and display name (with "you" chip for the current user's row)
- Total points, available balance, locked balance, active bet count, net points won

### 4.3 Admin Views

#### 4.3.1 Markets Tab

Management overview of all markets:
- Active markets table: question, pool size, Yes/No probability bar, bet count, close date, resolve/cancel action buttons
- Resolve actions require confirmation via an overlay modal — displays market title, pool size, and consequence language before committing
- Cancel action requires confirmation — describes the full refund to all bettors
- Recently resolved/cancelled markets table: question, outcome, status badge, resolution date

#### 4.3.2 Create Market Tab

Market creation form:
- **Quick templates:** 8 pre-filled question templates in two categories — Business (Secure Syncs shipments, revenue, sales close rate, hiring) and Fun/Local (Bills, Red Wings, Lilac Festival, Rochester snowfall). Clicking a template pre-fills all form fields.
- **Form fields:** Market Question (required), Description (optional), Resolution Criteria (optional), Close Date (optional)
- On submit: market is created with Active status and immediately appears in all participant views

#### 4.3.3 Simulate Activity Tab

Demo tooling for presenting the live application:

**Quick Actions panel:**
- **Simulate Round** — places random bets from all eligible participants across all active markets (60% participation rate, random side, random amount 10–400 pts within each user's available balance)
- **Advance Week** — runs the weekly allowance calculation for all participants (grants up to 250 pts to each participant, capped at 1,000 pts available balance)
- **Reset Demo** — restores the full application to its original seed state including all markets, users, bets, balances, and ledger history

**Manual Bet Simulator:**
- Participant selector (users already bet on the selected market are disabled)
- Market selector (active markets only)
- Side toggle (Yes / No)
- Amount slider + numeric input (range bounded by selected participant's available balance)
- Live preview panel: current bet amount, odds movement before → after, potential payout, balance warning if amount exceeds available

#### 4.3.4 Users Tab

Full participant management table showing each user's:
- Avatar, display name, login handle
- Total points, available balance, locked balance
- Active bet count, net points won, total lost, next allowance amount

Summary chips at top: total points in circulation across all participants, total locked in active bets.

### 4.4 Profile Modal

Accessible from the participant header via the ✏️ button. Allows the current participant to:
- Set or update a **nickname** — displayed between first and last name in curly quotes (e.g., `Cameron "Cam" Chambers`)
- Choose an **avatar color** from 10 palette swatches
- Preview changes live before saving
- Cancel to discard changes

---

## 5. Game Mechanics

### 5.1 Points Economy

| Parameter | Value |
|---|---|
| Starting balance | 1,000 pts |
| Weekly allowance cap | 250 pts |
| Allowance ceiling | Does not push available balance above 1,000 pts |
| Bet minimum | 1 pt |
| Bet maximum | Full available balance |
| Bets per market | 1 per participant |

**Allowance formula:**
```
grant = max(0, min(250, 1000 − availableBalance))
```
A participant who has already lost points can receive more than 250 pts back over time, but the top-up per week is capped at 250 and their balance is never pushed above 1,000.

### 5.2 Balance States

Each participant maintains two balances:

- **Available** — points free to bet with
- **Locked** — points committed to active bets (not spendable)

When a bet is placed: `availableBalance -= amount`, `lockedBalance += amount`.  
When a market resolves: locked balance is released for both winners and losers; winners receive their payout into available balance.

### 5.3 Odds & Payouts

Markets use a **parimutuel (pool-based) model**. There are no fixed odds — the probability and multiplier are derived directly from the proportion of money bet on each side.

**Implied probability:**
```
pctYes = totalYes / (totalYes + totalNo) × 100
pctNo  = 100 − pctYes
```

**Payout multiplier:**
```
multYes = totalPool / totalYes
multNo  = totalPool / totalNo
```

**Winner payout:**
```
payout = round(betAmount × (totalPool / winningPool))
```
Winners receive a proportional share of the entire pool in ratio to their stake in the winning side. If all bets are on one side (winningPool = losingPool = totalPool), winners receive their bet back.

**Potential payout preview** (shown before placing): calculates payout including the participant's own proposed bet added to the pool, giving an accurate forward estimate.

### 5.4 Market Resolution

An admin resolves a market by selecting Yes or No. Resolution:
1. Marks the market status as `Resolved` with `resolution` and `resolvedAt`
2. Settles all active bets: winners marked `Won` with calculated payout, losers marked `Lost` with `payout: 0`
3. Updates all affected participant balances and lifetime stats
4. Creates ledger entries for all payouts and forfeitures

**Idempotency:** A market in any non-Active state cannot be resolved or cancelled again.

### 5.5 Market Cancellation

An admin can cancel any active market. Cancellation:
1. Marks all active bets as `Refunded` with `payout = betAmount`
2. Returns the full wagered amount to each participant's available balance
3. Creates ledger entries for all refunds
4. Marks the market as `Cancelled` — no points are won or lost

### 5.6 Ledger

Every point movement is recorded in an append-only ledger:

| Type | Trigger |
|---|---|
| `Allowance` | Weekly grant or new participant registration |
| `Bet` | Bet placed (negative amount = spend) or bet lost (amount = 0, note records forfeiture) |
| `Payout` | Winning bet settled |
| `Refund` | Market cancelled |

---

## 6. Data Model

All state is persisted to `localStorage` under the key `fp_state_v4`. On first load, or when the key is absent, the app seeds from a hardcoded default dataset.

### 6.1 Market

```
{
  id:                  number        // auto-incrementing
  title:               string        // the binary question
  description:         string        // optional context
  resolutionCriteria:  string        // explicit resolution rules
  status:              'Active' | 'Resolved' | 'Cancelled'
  resolution:          'Yes' | 'No' | null
  resolvedAt:          ISO8601 | null
  closesAt:            ISO8601 | null
  createdAt:           ISO8601
}
```

### 6.2 User

```
{
  id:                  number
  loginName:           string        // slug: "first.last"
  displayName:         string        // "First Last"
  nickname:            string | null // shown as First "Nickname" Last
  color:               string        // hex avatar color
  availableBalance:    number
  lockedBalance:       number
  lastAllowanceDate:   ISO8601 | null
  totalWon:            number        // lifetime net winnings (payout - stake)
  totalLost:           number        // lifetime points forfeited
}
```

### 6.3 Bet

```
{
  id:        number
  marketId:  number
  userId:    string        // loginName
  side:      'Yes' | 'No'
  amount:    number
  placedAt:  ISO8601
  status:    'Active' | 'Won' | 'Lost' | 'Refunded'
  payout:    number | null // null while Active, set on settlement
}
```

### 6.4 Ledger Entry

```
{
  id:        number
  userId:    string
  type:      'Allowance' | 'Bet' | 'Payout' | 'Refund'
  amount:    number
  marketId:  number | null
  betId:     number | null
  note:      string
  createdAt: ISO8601
}
```

### 6.5 Global State

**Persistent (`D`, localStorage):**
```
{
  markets:   Market[]
  users:     User[]
  bets:      Bet[]
  ledger:    LedgerEntry[]
  nextIds:   { market, bet, user, ledger }   // auto-increment counters
  weekLabel: string                           // e.g., "Week 2"
}
```

**Session-only (`S`, in-memory):**
```
{
  role:            'admin' | 'participant' | null
  userId:          string | null
  view:            string
  adminTab:        string
  selectedMarket:  number | null
  confirmPending:  function | null
  banners:         object
  betSide:         'Yes' | 'No'
  betAmount:       number
  simUserId:       string | null
  simMarketId:     number | null
  simSide:         'Yes' | 'No'
  simAmount:       number
  editColor:       string | null
  editNickname:    string
}
```

---

## 7. Seed Dataset

The application ships with a pre-populated demo state representing the team partway through a real season of play.

### Active Markets (8)

| # | Category | Question | Closes | Pool | Odds |
|---|---|---|---|---|---|
| 1 | Business | Will we ship 200 Secure Syncs in May 2026? | May 31 | 700 pts | 50/50 |
| 2 | Business | Will Q2 2026 gross revenue exceed Q1 2026? | Jul 15 | 550 pts | 64% Yes |
| 3 | Business | Will we close 10+ new enterprise accounts in Q2? | Jul 7 | 325 pts | 38% Yes |
| 4 | Business | Will we hit our Q2 hiring target of 20 new hires? | Jun 30 | 225 pts | 56% Yes |
| 5 | Fun | Will the Buffalo Bills win their 2026 season opener? | Sep 7 | 475 pts | 68% Yes |
| 6 | Fun | Will the Rochester Red Wings finish April above .500? | Apr 30 | 575 pts | 65% Yes |
| 7 | Fun | Will the 2026 Rochester Lilac Festival draw 500K+ visitors? | May 18 | 250 pts | 61% Yes |
| 8 | Fun | Will Rochester get measurable snowfall in May 2026? | Jun 1 | 325 pts | 46% Yes |

### Resolved Markets (2, for historical context)

| # | Question | Outcome | Resolved |
|---|---|---|---|
| 9 | Did the Buffalo Sabres qualify for the 2026 NHL Playoffs? | **No** | Apr 12 |
| 10 | Did we achieve 95%+ NPS score in Q1 2026? | **Yes** | Apr 5 |

### Starting Balances

| Participant | Available | Locked | Total |
|---|---|---|---|
| Sam Torrey | 600 | 400 | 1,000 |
| Benson Pearson | 650 | 500 | 1,150 |
| Cameron Chambers | 300 | 700 | 1,000 |
| Dylan Panarra | 950 | 500 | 1,450 |
| Cody Mcconnell | 700 | 550 | 1,250 |
| Sophie Zangs | 375 | 625 | 1,000 |

---

## 8. UI & Visual Design

### 8.1 Brand

| Element | Value |
|---|---|
| Logo | Safran wordmark (white on transparent, embedded base64 PNG) |
| Product name | "Forecast **Pulse**" — Pulse in accent blue |
| Color system | Dark navy palette — see §8.2 |
| Typography | System UI stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui` |

### 8.2 Color Variables

| Variable | Value | Usage |
|---|---|---|
| `--bg` | `#0a0c10` | Page background |
| `--bg2` | `#0e1118` | Cards, header |
| `--bg3` | `#141a24` | Inputs, secondary surfaces |
| `--bg4` | `#1a2235` | Hover states |
| `--border` | `#1e2a3e` | Default borders |
| `--border2` | `#273551` | Dividers |
| `--text` | `#e2e8f0` | Primary text |
| `--text2` | `#94a3b8` | Secondary text |
| `--text3` | `#64748b` | Muted / placeholder |
| `--accent` | `#4f8ef7` | Safran blue — CTAs, active states |
| `--accent-hover` | `#74b2ff` | Hover accent |
| `--yes-text` | `#3fb950` | Yes / Win green |
| `--no-text` | `#f85149` | No / Lose red |
| `--warn-text` | `#e3b341` | Locked balance amber |

### 8.3 Component Patterns

- **Buttons:** `.btn` base class + modifier (`.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-yes`, `.btn-no`) + size (`.btn-sm`, `.btn-lg`, `.btn-xl`)
- **Odds bar:** animated fill bar with Yes (green) and No (red) segments
- **Avatars:** colored circles with two-letter initials derived from display name, nickname stripped before initials calculation
- **Toasts:** top-right notification stack, 4.5-second auto-dismiss, typed by `success` / `error` / `info`
- **Confirm overlay:** full-screen modal intercept for destructive actions (resolve, cancel market, reset demo)

---

## 9. Technical Architecture

### 9.1 Deployment

| Property | Value |
|---|---|
| Format | Single-file HTML — zero build tools, zero dependencies |
| Runtime | Any modern browser (Chrome, Edge, Safari, Firefox) |
| Server | Static file serve — `node event-dashboard/serve.js` on port 3000 |
| Persistence | `localStorage` only — no backend, no network calls |
| Logo asset | Base64-embedded directly in `<script>` as `SAFRAN_LOGO` constant |

### 9.2 File

```
forecast-pulse-app/
└── index.html    (~200 KB including embedded logo)
```

All CSS, JavaScript, and the Safran logo are inlined in this single file.

### 9.3 Rendering Model

The application uses a synchronous, full-page re-render pattern:

```
render()
  → if login:       renderLogin()
  → if admin:       renderAdminShell() → renderAdmin[Tab]()
  → if participant: renderParticipantShell() → render[View](user)
```

`render()` sets `document.getElementById('root').innerHTML` on every state change. There is no virtual DOM or diffing — the entire shell re-renders on navigation and tab changes.

Event listeners for the admin shell are re-attached after each render via `attachAdminListeners()` (handles the amount slider sync).

### 9.4 State Management

```
D  ←  localStorage ('fp_state_v4')   persistent game state
S  ←  in-memory object               session/UI state (not persisted)
```

`saveData()` serializes `D` to `localStorage` after every mutation. `loadData()` deserializes on page load, falling back to `seedData()` if absent or unreadable.

### 9.5 Key Constants

```js
STORAGE_KEY   = 'fp_state_v4'
STARTING_BAL  = 1000     // pts granted to new participants
MAX_ALLOWANCE = 250      // pts per weekly grant
```

---

## 10. Future Roadmap

The following features are not in scope for the current demo build but represent natural product extensions for a production deployment.

### Phase 2 — Enhanced Engagement
- **Market comments** — threaded discussion thread per market for participants to share reasoning
- **Resolution confidence indicator** — admin tags markets with expected resolution date; a countdown shows on each card
- **Push notifications** — browser notifications when a market resolves or a bet is won
- **Bet editing window** — allow participants to change their bet within the first N minutes of placing it

### Phase 3 — Analytics & Intelligence
- **Odds history chart** — time-series visualization of Yes probability from market open to close
- **Calibration scoring** — track how accurate each participant's predictions are over time (Brier score)
- **Market correlation** — surface when two active markets are likely to resolve together (e.g., "Q2 Revenue" and "10+ Enterprise Accounts")
- **Admin digest** — weekly email/Teams summary of market standings and upcoming close dates

### Phase 4 — Production Hardening
- **SharePoint backend** — migrate persistence from localStorage to the existing SharePoint webpart data model (Markets list, Bets list, Users list, Ledger list)
- **Azure AD authentication** — replace profile picker with SSO login using the user's Safran Microsoft identity
- **Role management** — SharePoint group-based authorization for admin access
- **Audit log** — immutable ledger viewable by admins for compliance and dispute resolution
- **Multi-team support** — separate market pools per business unit or region

---

## 11. Out of Scope

The following are explicitly not requirements for the current version:

- Real money or real financial instruments of any kind
- Integration with external data sources for auto-resolution
- Mobile native application (responsive web is sufficient)
- Multi-language support
- Accessibility compliance (WCAG) — desirable but not required for internal demo use
- Market maker / liquidity mechanics (pure parimutuel pool is sufficient)
