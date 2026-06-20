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
  if (bracket.manual) return // manual bracket: operator advances winners by hand
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
  // Manual brackets are operator-driven: winners don't cascade and byes / 3rd place
  // aren't auto-filled — the operator builds every phase by hand.
  if (!clone.manual) {
    resolveByes(clone, byId)
    resolveThirdPlace(clone, byId)
  }
  return { bracket: clone, champion: championOf(clone) }
}

// Champion = winner of the final phase, but only when that phase is a single decided
// match. A manual edit can leave the final ambiguous (0 or >1 matches) — then no champion.
export function championOf(bracket) {
  const finalRound = bracket.rounds[bracket.rounds.length - 1]
  if (finalRound && finalRound.length === 1) return finalRound[0].winnerId || null
  return null
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

// Apply a full manual edit of the whole bracket. `draftRounds` is the new phase→matches
// structure (phase index = position; each match: { id, dupAId, dupBId, winnerId }), and
// `draftThird` the optional 3rd-place match. Flags the bracket `manual` so winners stop
// auto-advancing — the operator now owns every phase. A preserved winner is dropped when
// its dupla is no longer one of the two sides (duplas were edited under it).
export function applyManualEdit(bracket, draftRounds, draftThird) {
  const clone = structuredClone(bracket)
  clone.manual = true
  const keepWinner = (w, a, b) => (w && (w === a || w === b) ? w : null)
  clone.rounds = draftRounds.map((round, ri) =>
    round.map((m, si) => {
      const dupAId = m.dupAId ?? null
      const dupBId = m.dupBId ?? null
      return {
        id: m.id,
        round: ri,
        slot: si,
        dupAId,
        dupBId,
        winnerId: keepWinner(m.winnerId, dupAId, dupBId),
      }
    }),
  )
  if (draftThird) {
    const a = draftThird.dupAId ?? null
    const b = draftThird.dupBId ?? null
    clone.thirdPlace = {
      ...(clone.thirdPlace || makeThirdPlace()),
      dupAId: a,
      dupBId: b,
      winnerId: keepWinner(draftThird.winnerId, a, b),
    }
  }
  return { bracket: clone, champion: championOf(clone) }
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
