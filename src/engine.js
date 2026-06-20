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

// Disputa de 3º lugar: a standalone match (outside the rounds tree) between the two
// semifinal losers. round/slot are null — it never feeds another match.
function makeThirdPlace() {
  return { id: uid('tp'), round: null, slot: null, isThird: true, dupAId: null, dupBId: null, winnerId: null }
}

// The semifinal round = the round just before the final. Always 2 matches for 4/8/16.
function semifinalRound(bracket) {
  return bracket.rounds.length >= 2 ? bracket.rounds[bracket.rounds.length - 2] : null
}

function loserOf(match) {
  if (!match.winnerId) return null
  return match.winnerId === match.dupAId ? match.dupBId : match.dupAId
}

// Seed the 3rd-place match with both semifinal losers once both semis resolve.
// Mirrors resolveByes: a W.O. loser auto-hands 3rd place to the real loser.
function resolveThirdPlace(bracket, byId) {
  const tp = bracket.thirdPlace
  if (!tp || tp.winnerId) return
  const semis = semifinalRound(bracket)
  if (!semis || semis.length < 2) return
  const [s1, s2] = semis
  if (!s1.winnerId || !s2.winnerId) return // wait for both semifinals
  if (tp.dupAId == null) tp.dupAId = loserOf(s1)
  if (tp.dupBId == null) tp.dupBId = loserOf(s2)
  const aWO = isWOId(byId, tp.dupAId)
  const bWO = isWOId(byId, tp.dupBId)
  if (aWO && bWO) tp.winnerId = tp.dupAId
  else if (aWO !== bWO) tp.winnerId = aWO ? tp.dupBId : tp.dupAId
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

  const bracket = { size, rounds, thirdPlace: makeThirdPlace() }
  // Auto-advance any match that already has a W.O. side, cascading forward.
  resolveByes(bracket, byId)
  resolveThirdPlace(bracket, byId)
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
  if (match.isThird) return // standalone — feeds nothing
  const next = bracket.rounds[match.round + 1]
  if (!next) return // final
  const nextMatch = next[Math.floor(match.slot / 2)]
  if (match.slot % 2 === 0) nextMatch.dupAId = winnerId
  else nextMatch.dupBId = winnerId
}

// First match ready to play: both sides real & known, no winner yet. The
// 3rd-place dispute is offered right before the final (convention).
export function nextPlayableMatch(bracket, byId) {
  if (!bracket) return null
  const playable = (m) =>
    m &&
    !m.winnerId &&
    m.dupAId != null &&
    m.dupBId != null &&
    !isWOId(byId, m.dupAId) &&
    !isWOId(byId, m.dupBId)
  for (let ri = 0; ri < bracket.rounds.length; ri++) {
    if (ri === bracket.rounds.length - 1 && playable(bracket.thirdPlace)) return bracket.thirdPlace
    for (const m of bracket.rounds[ri]) if (playable(m)) return m
  }
  return null
}

export function findMatch(bracket, matchId) {
  if (!bracket) return null
  for (const round of bracket.rounds) {
    for (const m of round) if (m.id === matchId) return m
  }
  if (bracket.thirdPlace?.id === matchId) return bracket.thirdPlace
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
  resolveThirdPlace(clone, byId)

  const finalRound = clone.rounds[clone.rounds.length - 1]
  const champion = finalRound[0]?.winnerId || null
  return { bracket: clone, champion }
}

// True once any *real* match (both sides non-W.O.) has a recorded winner — i.e. the
// operator has actually played a game. Re-seeding after that would wipe results, so the
// UI uses this to lock editing.
export function hasPlayedMatch(bracket, byId) {
  if (!bracket) return false
  const realWin = (m) => m.winnerId && !isWOId(byId, m.dupAId) && !isWOId(byId, m.dupBId)
  for (const round of bracket.rounds) for (const m of round) if (realWin(m)) return true
  if (bracket.thirdPlace && realWin(bracket.thirdPlace)) return true
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
  if (clone.thirdPlace) {
    clone.thirdPlace.winnerId = null
    clone.thirdPlace.dupAId = null
    clone.thirdPlace.dupBId = null
  } else {
    clone.thirdPlace = makeThirdPlace() // brackets created before this feature
  }
  resolveByes(clone, byId)
  resolveThirdPlace(clone, byId)
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
