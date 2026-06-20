// Taça Guaraná — tournament engine. Pure functions, no React, no storage.
// Single elimination, bracket sizes 4/8/16, W.O. byes auto-advance.
// See CLAUDE.md §5–6 for the state model and business rules.

export const CUPS_PER_TEAM = 6
const SUPPORTED_SIZES = [4, 8, 16]

let counter = 0
export function uid(prefix = 'id') {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter}`
}

export function createInitialState() {
  return {
    tournamentName: '', // operator-given edition label, e.g. "Taça de Inverno 2026"
    players: [], // { id, name }
    duplas: [], // { id, name, playerIds: [a, b], isWO }
    bracket: null, // { size, rounds: [[match]] }
    currentMatchId: null,
    cups: { left: CUPS_PER_TEAM, right: CUPS_PER_TEAM },
    undoStack: [], // scoring actions, newest last
    stats: { byPlayer: {} }, // { [playerId]: hits } — this tournament
    champion: null, // dupla id once final resolves
  }
}

// Nearest supported bracket size that fits n real duplas.
export function bracketSizeFor(n) {
  for (const s of SUPPORTED_SIZES) if (n <= s) return s
  return 16 // cap — extra duplas beyond 16 are dropped by caller
}

function makeWO() {
  return { id: uid('wo'), name: 'W.O.', playerIds: [], isWO: true }
}

function makeMatch(round, slot) {
  return { id: uid('m'), round, slot, dupAId: null, dupBId: null, winnerId: null }
}

// Build a single-elimination bracket from an ordered dupla list (already shuffled).
// Pads to the bracket size with W.O. byes, then auto-resolves bye matches.
export function generateBracket(duplas) {
  const real = duplas.filter((d) => !d.isWO).slice(0, 16)
  const size = bracketSizeFor(real.length)

  const slots = [...real]
  while (slots.length < size) slots.push(makeWO())

  const roundCount = Math.log2(size)
  const rounds = []
  for (let r = 0; r < roundCount; r++) {
    const matchCount = size / 2 ** (r + 1)
    rounds.push(Array.from({ length: matchCount }, (_, s) => makeMatch(r, s)))
  }

  // Seed round 0 with the padded slot list, two duplas per match.
  rounds[0].forEach((m, i) => {
    m.dupAId = slots[i * 2].id
    m.dupBId = slots[i * 2 + 1].id
  })

  const allDuplas = [...real, ...slots.filter((d) => d.isWO)]
  const byId = Object.fromEntries(allDuplas.map((d) => [d.id, d]))

  const bracket = { size, rounds }
  // Auto-advance any match that already has a W.O. side, cascading forward.
  resolveByes(bracket, byId)
  return { bracket, woDuplas: slots.filter((d) => d.isWO) }
}

function isWOId(byId, id) {
  return id == null || byId[id]?.isWO
}

// Cascade: resolve every match where exactly one side is a real dupla vs a W.O.
function resolveByes(bracket, byId) {
  let changed = true
  while (changed) {
    changed = false
    for (const round of bracket.rounds) {
      for (const m of round) {
        if (m.winnerId || m.dupAId == null || m.dupBId == null) continue
        const aWO = isWOId(byId, m.dupAId)
        const bWO = isWOId(byId, m.dupBId)
        if (aWO && bWO) {
          setWinner(bracket, m, m.dupAId) // both byes — push one through
          changed = true
        } else if (aWO !== bWO) {
          setWinner(bracket, m, aWO ? m.dupBId : m.dupAId)
          changed = true
        }
      }
    }
  }
}

// Place a winner into the next round's feeding slot. Mutates bracket.
function setWinner(bracket, match, winnerId) {
  match.winnerId = winnerId
  const next = bracket.rounds[match.round + 1]
  if (!next) return // final
  const nextMatch = next[Math.floor(match.slot / 2)]
  if (match.slot % 2 === 0) nextMatch.dupAId = winnerId
  else nextMatch.dupBId = winnerId
}

// First match ready to play: both sides real & known, no winner yet.
export function nextPlayableMatch(bracket, byId) {
  if (!bracket) return null
  for (const round of bracket.rounds) {
    for (const m of round) {
      if (m.winnerId) continue
      if (m.dupAId == null || m.dupBId == null) continue
      if (isWOId(byId, m.dupAId) || isWOId(byId, m.dupBId)) continue
      return m
    }
  }
  return null
}

export function findMatch(bracket, matchId) {
  if (!bracket) return null
  for (const round of bracket.rounds) {
    for (const m of round) if (m.id === matchId) return m
  }
  return null
}

export function duplaById(state, id) {
  return state.duplas.find((d) => d.id === id) || null
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id) || null
}

// Resolve a played match: record winner, cascade, detect champion. Returns new bracket.
export function recordResult(bracket, byId, matchId, winnerId) {
  const clone = structuredClone(bracket)
  const m = findMatch(clone, matchId)
  if (!m) return { bracket, champion: null }
  setWinner(clone, m, winnerId)
  resolveByes(clone, byId)

  const finalRound = clone.rounds[clone.rounds.length - 1]
  const champion = finalRound[0]?.winnerId || null
  return { bracket: clone, champion }
}

// True once any *real* match (both sides non-W.O.) has a recorded winner — i.e. the
// operator has actually played a game. Re-seeding after that would wipe results, so the
// UI uses this to lock editing.
export function hasPlayedMatch(bracket, byId) {
  if (!bracket) return false
  for (const round of bracket.rounds)
    for (const m of round)
      if (m.winnerId && !isWOId(byId, m.dupAId) && !isWOId(byId, m.dupBId)) return true
  return false
}

// Re-seed round 0 from a fresh slot list and rebuild everything downstream. `slots` is the
// ordered dupla-id list for round 0 (match i takes slots[2i] vs slots[2i+1]). Clears all
// winners + feeds in later rounds, re-seeds round 0, then re-resolves W.O. byes.
export function reseedRound0(bracket, byId, slots) {
  const clone = structuredClone(bracket)
  clone.rounds.forEach((round, ri) => {
    round.forEach((m) => {
      m.winnerId = null
      if (ri > 0) {
        m.dupAId = null
        m.dupBId = null
      }
    })
  })
  clone.rounds[0].forEach((m, i) => {
    m.dupAId = slots[i * 2] ?? null
    m.dupBId = slots[i * 2 + 1] ?? null
  })
  resolveByes(clone, byId)
  return clone
}

export const ROUND_NAMES = {
  // keyed by remaining rounds-from-end
  1: 'Final',
  2: 'Semifinal',
  3: 'Quartas',
  4: 'Oitavas',
}

export function roundLabel(bracket, roundIndex) {
  const fromEnd = bracket.rounds.length - roundIndex
  return ROUND_NAMES[fromEnd] || `Rodada ${roundIndex + 1}`
}
