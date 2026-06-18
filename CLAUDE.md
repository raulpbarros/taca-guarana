# CLAUDE.md — Taça Guaraná

> **SESSION START — ALWAYS DO FIRST:** Before any work in this repo, activate the
> caveman skill: invoke `/caveman:caveman` (level `full`). Keep it active for the
> whole session. Code, commits, PRs, and security/irreversible-action warnings are
> still written in normal prose (caveman boundaries).

---

## 1. What this is

**Taça Guaraná** — local Beer Pong tournament manager. Single Page Application (SPA),
runs on ONE central screen (notebook or tablet) at the event, visible to players and
crowd. Operated by one person ("the operator") with minimum friction: 1-tap scoring,
giant buttons, readable from 3 meters.

Core promise: **resilient to reloads**. Whole tournament state lives in `localStorage`.
Refresh, crash, or power-off → resume exactly where it stopped.

## 2. Stack

- **React 19** SPA + **Vite 7** (dev server / build).
- **Tailwind CSS v4** (CSS-first config via `@tailwindcss/vite`, `@theme` block in `src/index.css`).
- **lucide-react** icons.
- **Package manager: npm** (Node v24, pnpm not installed on this machine).
- State: React hooks (`useState`/`useEffect`) + `localStorage`. No backend, no router lib.

### Commands
```
npm install      # deps
npm run dev      # dev server (Vite)
npm run build    # production build -> dist/
npm run preview  # serve built dist/
```

## 3. Design system — "Arena Guaraná"

Direction = **jumbotron at a party**, not a SaaS dashboard. One central screen, crowd
watching from 3m. Dark green field makes red cups glow; gold marks champions only.
Tokens live in `src/index.css` `@theme`. Use token names, never raw hex.

### Color
| Role | Hex | Token |
|------|-----|-------|
| Mata (arena background) | `#062514` | `mata` |
| Mata raised panel | `#0a3a20` | `mata-2` |
| Verde Guaraná (brand) | `#0C4626` | `guarana` |
| Vermelho Copo (scoring/live/danger) | `#C8232B` | `copo` |
| Copo glow (hover/active cup) | `#ff3b44` | `copo-glow` |
| **Dourado** (champion & MVP #1 ONLY) | `#E8B23A` | `dourado` |
| Branco | `#FFFFFF` | `branco` |
| Fundo (light form surfaces) | `#F8F9FA` | `fundo` |
| Gelo (text on dark) | `#F4F6F4` | `gelo` |
| Tinta (text on light) | `#1A1A1A` | `tinta` |
| Inativo (eliminated cup) | `#5A6B60` | `inativo` |
| Hairline on field | `#163d28` | `linha` |

**Gold discipline:** `dourado` is reserved. It marks exactly one thing per context —
tournament champion, MVP #1 row, the "Gerar Campeonato" CTA. Never use it as a generic
highlight. That restraint is the whole point of the accent.

### Typography (3 roles)
- `font-display` → **Anton** — ultra-bold condensed caps. Headers, dupla names, victory,
  big CTAs. Caps-only by nature.
- `font-sans` → **Hanken Grotesk** — body, labels, buttons. (default `body` font)
- `font-mono` → **Space Mono** — tabular data: cup counts, seeds, stats, kickers.
  Scoreboard digits ARE the score — render big in mono.

Loaded via Google Fonts `<link>` in `index.html`.

### Layout & signature
- Dark `mata` field everywhere; light `fundo` panels only for data-entry forms (Setup roster).
- Hero of the app = the **cup triangle** (3-2-1 rack) that physically empties as scored —
  it is the scoreboard, not a number-with-label. Knocked cup sinks (`taca-cup-out`) → gray
  + red X.
- Section headers use the `SectionHead` helper (`tabs/Setup.jsx`): mono kicker + Anton title.
- Soft corners `rounded-lg`/`rounded-xl`, hairline `border-linha`, restrained shadows.
  Motion lives in `index.css` (`taca-pulse`, `taca-cup-out`, `taca-pop`, `taca-gold`) and
  all respect `prefers-reduced-motion`. Keyboard focus = gold outline.

Logo at `public/logo-full.png` (red cup + green banner).

## 4. Screens — 4 top tabs

Big clean top navigation. If a game is in progress, the **Placar** tab gets a pulsing
indicator.

### A. Configuração (setup)
- Input to add player names one by one (Enter or "Adicionar" button).
- **"Sorteio Mágico de Duplas"** — shuffle players, form pairs (duplas) automatically.
  Odd count → warn or create a `W.O.` partner.
- Editable dupla names (e.g. `Dupla 1 — Lucas & Enzão`).
- Giant **"GERAR CAMPEONATO"** → builds bracket, goes to Chaveamento.

### B. Chaveamento (bracket)
- Single-elimination tree for **4, 8, or 16 duplas**.
- Auto-size to nearest supported bracket; fill empty slots with `W.O.`/byes.
- Each match block: `Dupla 1 vs Dupla 2`. Ready match shows **"INICIAR JOGO"** →
  switches to Placar loaded with that match. Future matches locked.

### C. Placar ao Vivo (main game screen)
- Split exactly in half: left side vs right side.
- Each side top: dupla name + cups remaining (starts at **6**).
- Each side center: 6 cups in classic triangle (3-2-1).
- Below cups: two **GIANT** buttons, one per player of that dupla, labeled
  `<name> +1 Acerto`.
- **Click dynamic:** operator taps the scoring player's button →
  1. remove 1 cup from the **OPPONENT** team (cup turns gray + red X),
  2. +1 to that player's individual cups-hit stat.
- Footer center: huge **"DESFAZER ÚLTIMA AÇÃO"** (undo).
- Win: a team hits 0 cups → giant modal **"VITÓRIA DA DUPLA X!"**. "Confirmar e
  Avançar" saves result, advances winner in bracket, returns to Chaveamento.

### D. Ranking MVP
- Simple table, individual players ordered by total cups hit.
- Columns: `Posição | Jogador | Dupla | Total de Copos Acertados`.
- **Persist all-time** across tournaments (cumulative), plus a per-tournament view.

## 5. State model & persistence

Single tournament-state object synced to `localStorage` on every change. Suggested shape:

```
{
  activeTab,                 // 'setup' | 'bracket' | 'scoreboard' | 'ranking'
  players: [{ id, name }],
  duplas: [{ id, name, playerIds: [a, b] }],
  bracket: { size, rounds: [[ match ]] },  // match: { id, dupAId, dupBId, winnerId, ... }
  currentMatchId,
  cups: { left: 6, right: 6 },             // active match cup counts
  undoStack: [ action ],                   // >= last 5 scoring actions
  stats: {                                 // per-tournament cups hit, keyed by playerId
    byPlayer: { [playerId]: hits }
  }
}
```

All-time MVP stored under a **separate** `localStorage` key so it survives new tournaments:
```
tacaGuarana:allTimeMvp = { [playerName|playerId]: totalHits }
```

### Persistence rules
- Write whole state to `localStorage` on every mutation (`useEffect` on state).
- On load, hydrate from `localStorage`; fall back to clean initial state if absent/corrupt.
- Versioning key (e.g. `tacaGuarana:v1`) so future schema changes can migrate/reset safely.

### Undo
- `undoStack` is an array (stack) of scoring actions. Keep at least the **last 5**.
- Each entry holds enough to fully reverse: which player scored, which cup removed,
  which side, prior cup count. Undo restores cup + decrements player stat without
  breaking bracket integrity.

## 6. Business rules

- Format: **single elimination** only.
- Cups per team: **6**, triangle 3-2-1. Win at 0.
- Scoring a player removes an **opponent** cup (never own).
- Bracket sizes **4 / 8 / 16**; non-exact counts padded with `W.O.`/byes that
  auto-advance.
- Winner auto-advances; tournament ends when final resolved.
- MVP ranking: sum of individual cups hit; all-time cumulative + per-tournament.

## 7. Layout / structure

```
taca-guarana/
  CLAUDE.md
  index.html
  vite.config.js
  package.json
  public/
    logo-full.png
  src/
    main.jsx
    index.css            # @import "tailwindcss" + @theme palette
    App.jsx              # tab shell + persisted activeTab + header/logo
    hooks/
      useLocalStorage.js # generic persisted-state hook
    tabs/
      Setup.jsx          # Configuração
      Bracket.jsx        # Chaveamento
      Scoreboard.jsx     # Placar ao Vivo
      Ranking.jsx        # Ranking MVP
  assets/                # source logo (not bundled)
  instructions/          # original spec
```

Keep modular but pragmatic. One robust, maintainable component per tab is fine.
UI language: **Portuguese (pt-BR)**.

## 8. Status

All 4 tabs functional with the Arena Guaraná design system applied (full restyle).
- Engine in `src/engine.js` (pure): bracket gen 4/8/16, W.O. bye cascade, winner advance,
  champion detect, round labels.
- Central state in `App.jsx` via `useLocalStorage('tacaGuarana:v1:state')`; all-time MVP
  under `tacaGuarana:allTimeMvp` (keyed by player **name** to survive new tournaments).
- Setup: roster + Sorteio + editable duplas + Gerar. Bracket: round columns, Iniciar/locked/
  decided + champion banner. Scoreboard: cup triangle, per-player scoring, undo (≥10), victory
  modal + advance. Ranking: per-tournament + all-time toggle.
- Build verified (`npm run build`). Not yet manually exercised in browser end-to-end.

Open polish ideas: bracket connector lines between columns; sound/haptic on score;
reset-tournament button; export/share ranking.
