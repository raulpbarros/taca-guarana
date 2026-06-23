// Taça Guaraná — tournament engine (double elimination). Pure functions, no React.
// Upper bracket: standard seeding, winners auto-advance, W.O. byes resolved.
// Lower bracket: starts empty; operator adds matches via "→ Lower" or edit panel.
// Grand Final: upper champion vs lower champion.

export const CUPS_PER_TEAM = 6
const SUPPORTED_SIZES = [4, 8, 16]

let counter = 0
export function uid(prefix = 'id') {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter}`
}

export function createInitialState() {
  return {
    tournamentName: '',
    players: [],
    duplas: [],
    bracket: null,
    currentMatchId: null,
    cups: { left: CUPS_PER_TEAM, right: CUPS_PER_TEAM },
    undoStack: [],
    stats: { byPlayer: {} },
    champion: null,
  }
}

export function bracketSizeFor(n) {
  for (const s of SUPPORTED_SIZES) if (n <= s) return s
  return 16
}

function makeWO() {
  return { id: uid('wo'), name: 'W.O.', playerIds: [], isWO: true }
}

function makeMatch(track, round, slot) {
  return { id: uid('m'), track, round, slot, dupAId: null, dupBId: null, winnerId: null }
}

function makeGrandFinal() {
  return { id: uid('gf'), track: 'grand', round: null, slot: null, dupAId: null, dupBId: null, winnerId: null }
}

function isWOId(byId, id) {
  return id == null || byId[id]?.isWO
}

// Auto-advance winner within upper bracket. Last upper round winner → grandFinal.dupAId.
// Only called when !bracket.manual.
function setWinnerUpperAuto(bracket, match, winnerId) {
  match.winnerId = winnerId
  const next = bracket.upper[match.round + 1]
  if (!next) {
    if (bracket.grandFinal && !bracket.grandFinal.dupAId) {
      bracket.grandFinal.dupAId = winnerId
    }
    return
  }
  const nextMatch = next[Math.floor(match.slot / 2)]
  if (!nextMatch) return
  if (match.slot % 2 === 0) nextMatch.dupAId = winnerId
  else nextMatch.dupBId = winnerId
}

// Cascade W.O. byes in upper bracket only.
function resolveByesUpper(bracket, byId) {
  let changed = true
  while (changed) {
    changed = false
    for (const round of bracket.upper) {
      for (const m of round) {
        if (m.winnerId || m.dupAId == null || m.dupBId == null) continue
        const aWO = isWOId(byId, m.dupAId)
        const bWO = isWOId(byId, m.dupBId)
        if (aWO && bWO) {
          setWinnerUpperAuto(bracket, m, m.dupAId)
          changed = true
        } else if (aWO !== bWO) {
          setWinnerUpperAuto(bracket, m, aWO ? m.dupBId : m.dupAId)
          changed = true
        }
      }
    }
  }
}

// Generate a double-elimination bracket. Upper seeded from dupla list; lower starts empty.
export function generateDoubleElim(duplas) {
  const real = duplas.filter((d) => !d.isWO).slice(0, 16)
  const size = bracketSizeFor(real.length)

  const roundCount = Math.log2(size)
  const upper = []
  for (let r = 0; r < roundCount; r++) {
    const matchCount = size / 2 ** (r + 1)
    upper.push(Array.from({ length: matchCount }, (_, s) => makeMatch('upper', r, s)))
  }

  const grandFinal = makeGrandFinal()
  const bracket = { size, upper, lower: [], grandFinal, manual: true }

  return { bracket, woDuplas: [] }
}

// Find a match by ID across upper, lower, and grandFinal.
export function findMatch(bracket, matchId) {
  if (!bracket) return null
  for (const round of bracket.upper || []) {
    for (const m of round) if (m.id === matchId) return m
  }
  for (const round of bracket.lower || []) {
    for (const m of round) if (m.id === matchId) return m
  }
  if (bracket.grandFinal?.id === matchId) return bracket.grandFinal
  return null
}

// Return { track, round } for a match, or null.
export function matchTrack(bracket, matchId) {
  if (!bracket) return null
  for (let ri = 0; ri < (bracket.upper || []).length; ri++) {
    if (bracket.upper[ri].some((m) => m.id === matchId)) return { track: 'upper', round: ri }
  }
  for (let ri = 0; ri < (bracket.lower || []).length; ri++) {
    if (bracket.lower[ri].some((m) => m.id === matchId)) return { track: 'lower', round: ri }
  }
  if (bracket.grandFinal?.id === matchId) return { track: 'grand', round: null }
  return null
}

const UPPER_NAMES = { 1: 'Final', 2: 'Semifinal', 3: 'Quartas', 4: 'Oitavas' }
const LOWER_NAMES = { 1: 'Final', 2: 'Semifinal' }

export function upperRoundLabel(bracket, ri) {
  const fromEnd = (bracket.upper || []).length - ri
  return UPPER_NAMES[fromEnd] || `Fase ${ri + 1}`
}

export function lowerRoundLabel(bracket, ri) {
  const fromEnd = (bracket.lower || []).length - ri
  return LOWER_NAMES[fromEnd] || `Fase ${ri + 1}`
}

// Label for scoreboard VS spine.
export function matchPhaseLabel(bracket, matchId) {
  const info = matchTrack(bracket, matchId)
  if (!info) return ''
  if (info.track === 'grand') return 'Grande Final'
  if (info.track === 'upper') return `Upper — ${upperRoundLabel(bracket, info.round)}`
  if (info.track === 'lower') return `Lower — ${lowerRoundLabel(bracket, info.round)}`
  return ''
}

// First playable match (both sides known, real, no winner). Order: upper → lower → grand.
export function nextPlayableMatch(bracket, byId) {
  if (!bracket) return null
  const playable = (m) =>
    m &&
    !m.winnerId &&
    m.dupAId != null &&
    m.dupBId != null &&
    !isWOId(byId, m.dupAId) &&
    !isWOId(byId, m.dupBId)
  for (const round of bracket.upper || []) for (const m of round) if (playable(m)) return m
  for (const round of bracket.lower || []) for (const m of round) if (playable(m)) return m
  if (playable(bracket.grandFinal)) return bracket.grandFinal
  return null
}

// Tournament champion = winner of grandFinal.
export function championOf(bracket) {
  if (!bracket) return null
  return bracket.grandFinal?.winnerId || null
}

// Record a match result. Upper winners auto-advance if !manual.
// Lower final winner auto-populates grandFinal.dupBId if !manual.
export function recordResult(bracket, byId, matchId, winnerId) {
  const clone = structuredClone(bracket)

  let found = false
  for (const round of clone.upper || []) {
    for (const m of round) {
      if (m.id === matchId) {
        if (clone.manual) m.winnerId = winnerId
        else setWinnerUpperAuto(clone, m, winnerId)
        found = true
        break
      }
    }
    if (found) break
  }

  if (!found) {
    for (const round of clone.lower || []) {
      for (const m of round) {
        if (m.id === matchId) {
          m.winnerId = winnerId
          if (!clone.manual && clone.lower.length > 0) {
            const lastLower = clone.lower[clone.lower.length - 1]
            if (lastLower.length === 1 && lastLower[0].winnerId && clone.grandFinal && !clone.grandFinal.dupBId) {
              clone.grandFinal.dupBId = lastLower[0].winnerId
            }
          }
          found = true
          break
        }
      }
      if (found) break
    }
  }

  if (!found && clone.grandFinal?.id === matchId) {
    clone.grandFinal.winnerId = winnerId
  }

  return { bracket: clone, champion: championOf(clone) }
}

// True if any real (non-W.O.) match has been played.
export function hasPlayedMatch(bracket, byId) {
  if (!bracket) return false
  const realWin = (m) => m.winnerId && !isWOId(byId, m.dupAId) && !isWOId(byId, m.dupBId)
  for (const round of bracket.upper || []) for (const m of round) if (realWin(m)) return true
  for (const round of bracket.lower || []) for (const m of round) if (realWin(m)) return true
  if (bracket.grandFinal && realWin(bracket.grandFinal)) return true
  return false
}

// Add an empty match to an existing round. Sets manual=true.
export function addMatchToRound(bracket, track, roundIdx) {
  const clone = structuredClone(bracket)
  clone.manual = true
  const rounds = track === 'upper' ? clone.upper : clone.lower
  if (roundIdx < 0 || roundIdx >= rounds.length) return clone
  const slot = rounds[roundIdx].length
  rounds[roundIdx].push(makeMatch(track, roundIdx, slot))
  return clone
}

// Add a new round (with one empty match) to a track. Sets manual=true.
export function addRound(bracket, track) {
  const clone = structuredClone(bracket)
  clone.manual = true
  const rounds = track === 'upper' ? clone.upper : clone.lower
  const ri = rounds.length
  rounds.push([makeMatch(track, ri, 0)])
  return clone
}

// Remove a match from a round by ID. Sets manual=true.
export function removeMatch(bracket, track, roundIdx, matchId) {
  const clone = structuredClone(bracket)
  clone.manual = true
  const rounds = track === 'upper' ? clone.upper : clone.lower
  if (roundIdx < 0 || roundIdx >= rounds.length) return clone
  rounds[roundIdx] = rounds[roundIdx].filter((m) => m.id !== matchId)
  return clone
}

// Quick-action: send loser of a decided upper match to the lower bracket.
// Appends a new match (loser as dupAId) to the last lower round, or creates a new round.
export function sendLoserToLower(bracket, upperMatchId) {
  const clone = structuredClone(bracket)
  let loserId = null
  for (const round of clone.upper) {
    for (const m of round) {
      if (m.id === upperMatchId && m.winnerId) {
        loserId = m.winnerId === m.dupAId ? m.dupBId : m.dupAId
        break
      }
    }
    if (loserId !== null) break
  }
  if (!loserId) return clone

  if (clone.lower.length === 0) {
    clone.lower.push([
      { id: uid('m'), track: 'lower', round: 0, slot: 0, dupAId: loserId, dupBId: null, winnerId: null },
    ])
  } else {
    const lastRi = clone.lower.length - 1
    const lastRound = clone.lower[lastRi]
    lastRound.push({
      id: uid('m'),
      track: 'lower',
      round: lastRi,
      slot: lastRound.length,
      dupAId: loserId,
      dupBId: null,
      winnerId: null,
    })
  }
  return clone
}

// Apply a full manual edit. Sets manual=true.
export function applyManualEdit(bracket, draftUpper, draftLower, draftGrandFinal) {
  const clone = structuredClone(bracket)
  clone.manual = true
  const keepWinner = (w, a, b) => (w && (w === a || w === b) ? w : null)

  clone.upper = draftUpper.map((round, ri) =>
    round.map((m, si) => {
      const a = m.dupAId ?? null
      const b = m.dupBId ?? null
      return { id: m.id, track: 'upper', round: ri, slot: si, dupAId: a, dupBId: b, winnerId: keepWinner(m.winnerId, a, b) }
    }),
  )

  clone.lower = draftLower.map((round, ri) =>
    round.map((m, si) => {
      const a = m.dupAId ?? null
      const b = m.dupBId ?? null
      return { id: m.id, track: 'lower', round: ri, slot: si, dupAId: a, dupBId: b, winnerId: keepWinner(m.winnerId, a, b) }
    }),
  )

  if (draftGrandFinal) {
    const a = draftGrandFinal.dupAId ?? null
    const b = draftGrandFinal.dupBId ?? null
    clone.grandFinal = {
      ...(clone.grandFinal || makeGrandFinal()),
      dupAId: a,
      dupBId: b,
      winnerId: keepWinner(draftGrandFinal.winnerId, a, b),
    }
  }

  return { bracket: clone, champion: championOf(clone) }
}

// Assign a dupla to one slot of a match (side = 'a' | 'b'). duplaId = null to clear.
export function assignDuplaToSlot(bracket, matchId, side, duplaId) {
  const clone = structuredClone(bracket)
  clone.manual = true
  const m = findMatch(clone, matchId)
  if (!m) return clone
  if (side === 'a') m.dupAId = duplaId
  else m.dupBId = duplaId
  if (m.winnerId && m.winnerId !== m.dupAId && m.winnerId !== m.dupBId) m.winnerId = null
  return clone
}

// Swap the dupla in srcSide of srcMatch with the dupla in dstSide of dstMatch.
export function swapDuplaSlots(bracket, srcMatchId, srcSide, dstMatchId, dstSide) {
  const clone = structuredClone(bracket)
  clone.manual = true
  const src = findMatch(clone, srcMatchId)
  const dst = findMatch(clone, dstMatchId)
  if (!src || !dst) return clone
  const srcVal = srcSide === 'a' ? src.dupAId : src.dupBId
  const dstVal = dstSide === 'a' ? dst.dupAId : dst.dupBId
  if (srcSide === 'a') src.dupAId = dstVal; else src.dupBId = dstVal
  if (dstSide === 'a') dst.dupAId = srcVal; else dst.dupBId = srcVal
  if (src.winnerId && src.winnerId !== src.dupAId && src.winnerId !== src.dupBId) src.winnerId = null
  if (dst.winnerId && dst.winnerId !== dst.dupAId && dst.winnerId !== dst.dupBId) dst.winnerId = null
  return clone
}

export function duplaById(state, id) {
  return state.duplas.find((d) => d.id === id) || null
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id) || null
}
