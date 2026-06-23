// Placar — live match. Split field, 6-cup triangle that empties as scored, giant
// per-player buttons, undo, victory modal + auto-advance. See CLAUDE.md §4C.
import { useState, useEffect, useRef } from 'react'
import { Undo2, X, Target, Maximize2, ArrowRight, Volume2, VolumeX } from 'lucide-react'
import { SectionHead } from './Setup.jsx'
import {
  CUPS_PER_TEAM,
  findMatch,
  recordResult,
  nextPlayableMatch,
  matchPhaseLabel,
} from '../engine.js'
import { buildTournamentRecord } from '../history.js'
import { playBounce, playWin } from '../sfx.js'
import { playPointSound, playWinSound } from '../sounds.js'
import { randomGif } from '../gifs.js'

// On-screen life of a gif. MUST match the taca-gif-pop duration in index.css.
const GIF_MS = 4500
// Stall before a special gif fires (no point scored). 8 min.
const IDLE_MS = 8 * 60 * 1000

export default function Scoreboard({ ctx }) {
  const { state, setState, allTime, setAllTime, history, go, kiosk, setKiosk, sfxOn, setSfxOn } = ctx
  const [recent, setRecent] = useState(null) // `${side}:${index}` just knocked
  const [gif, setGif] = useState(null) // { url, key } situation gif on screen

  // Auto-dismiss the situation gif. New gif = new identity = timer resets.
  useEffect(() => {
    if (!gif) return
    const t = setTimeout(() => setGif(null), GIF_MS)
    return () => clearTimeout(t)
  }, [gif])

  // Stall watcher: if the live match goes IDLE_MS with no point, drop a special
  // gif to keep the room awake. lastActivity is bumped on every make and reset
  // when the match changes (see below). Poll loosely — exact timing isn't needed.
  const lastActivity = useRef(Date.now())
  useEffect(() => {
    const id = setInterval(() => {
      if (!handlers.current.live) return
      if (Date.now() - lastActivity.current >= IDLE_MS) {
        const url = randomGif('special')
        if (url) setGif({ url, key: Date.now() })
        lastActivity.current = Date.now()
      }
    }, 15000)
    return () => clearInterval(id)
  }, [])

  // New match on the table → fresh stall clock.
  useEffect(() => {
    lastActivity.current = Date.now()
  }, [state.currentMatchId])

  // Latest action handlers, refreshed every render so the global key listener
  // (registered once) always calls the current closures. See assignment below.
  const handlers = useRef({ key: () => {}, undo: () => {}, confirm: null, live: false })

  // Keep the big screen awake during a match (party venue, no touch for minutes).
  useEffect(() => {
    let lock = null
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen')
      } catch {
        /* denied or unsupported — non-fatal */
      }
    }
    acquire()
    const onVis = () => document.visibilityState === 'visible' && acquire()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      lock?.release?.().catch(() => {})
    }
  }, [])

  // Keyboard control for a notebook operator: 1/2 = left dupla players,
  // 3/4 = right dupla players, Z/Backspace = undo, F = kiosk, Esc = exit,
  // Enter = confirm the victory modal.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return
      const h = handlers.current
      const k = e.key.toLowerCase()
      if (k === 'enter' && h.confirm) return e.preventDefault(), h.confirm()
      if (k === 'escape') return setKiosk(false)
      if (k === 'f') return setKiosk((v) => !v)
      if (k === 'z' || k === 'backspace') return e.preventDefault(), h.undo()
      if (['1', '2', '3', '4'].includes(k)) return e.preventDefault(), h.key(k)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setKiosk])

  const match = state.bracket ? findMatch(state.bracket, state.currentMatchId) : null

  if (!match) {
    const hasBracket = !!state.bracket
    return (
      <div className="space-y-8">
        <SectionHead kicker="PASSO 3" title="Placar" />
        <div className="rounded-xl border border-dashed border-linha bg-mata-2 p-8 text-center text-gelo/60">
          <p>Nenhuma partida em andamento.</p>
          <button
            onClick={() => go(hasBracket ? 'bracket' : 'setup')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-copo px-5 py-3
                       font-display text-xl text-branco hover:bg-copo-glow active:scale-[0.98] transition"
          >
            {hasBracket ? 'Ir ao Chaveamento' : 'Montar Campeonato'}
            <ArrowRight size={22} />
          </button>
        </div>
      </div>
    )
  }

  const byId = Object.fromEntries(state.duplas.map((d) => [d.id, d]))
  const dupA = byId[match.dupAId]
  const dupB = byId[match.dupBId]
  const cups = state.cups
  const winnerSide = cups.left === 0 ? 'right' : cups.right === 0 ? 'left' : null

  // Which phase is on the table — feeds the VS spine ("Upper — Final", "Grande Final", …).
  const phase = matchPhaseLabel(state.bracket, state.currentMatchId)

  // Lead = who has knocked more of the opponent's cups. Drives the glow + spine.
  const leftProgress = CUPS_PER_TEAM - cups.right
  const rightProgress = CUPS_PER_TEAM - cups.left
  const leader = winnerSide
    ? null
    : leftProgress > rightProgress
      ? 'left'
      : rightProgress > leftProgress
        ? 'right'
        : null

  const playerName = (id) => state.players.find((p) => p.id === id)?.name || '—'
  const playerIsWO = (id) => !!state.players.find((p) => p.id === id)?.isWO

  const score = (scoringSide, scorerId) => {
    const victimSide = scoringSide === 'left' ? 'right' : 'left'
    if (cups[victimSide] <= 0 || winnerSide) return
    const prev = cups[victimSide]
    const isWin = prev - 1 === 0
    lastActivity.current = Date.now() // a point dropped — reset the stall clock
    setRecent(`${victimSide}:${CUPS_PER_TEAM - prev}`)
    if (sfxOn) {
      if (isWin) { playWin(); playWinSound() } else { playBounce(); playPointSound() }
    }

    // Match-winning cup → celebrate with a win gif (behind the victory modal).
    if (isWin) {
      const url = randomGif('win')
      if (url) setGif({ url, key: Date.now() })
    }

    // Situation gif. Classify this make from the current scoring streak — the
    // undoStack holds every make of this match (it resets on match change), and
    // each side maps to a stable dupId, so we can read player/team runs off it.
    // Priority: hat-trick (same player 3+) > b2b (same dupla 2+) > revenge
    // (team scoring right after the opponent did) > plain point. Skip the
    // winning cup — the victory modal owns the screen then.
    if (!isWin) {
      const dupId = scoringSide === 'left' ? match.dupAId : match.dupBId
      const sideDup = (sd) => (sd === 'left' ? match.dupAId : match.dupBId)
      const stack = state.undoStack
      let playerStreak = 1
      for (let i = stack.length - 1; i >= 0 && stack[i].scorerId === scorerId; i--) playerStreak++
      let teamStreak = 1
      for (let i = stack.length - 1; i >= 0 && sideDup(stack[i].scoringSide) === dupId; i--)
        teamStreak++
      const last = stack[stack.length - 1]
      const revenge = !!last && last.scoringSide !== scoringSide
      const cat =
        playerStreak >= 3 ? 'hatTrick' : teamStreak >= 2 ? 'b2b' : revenge ? 'revenge' : 'point'
      const url = randomGif(cat)
      if (url) setGif({ url, key: Date.now() })
    }

    setState((s) => ({
      ...s,
      cups: { ...s.cups, [victimSide]: prev - 1 },
      stats: {
        byPlayer: {
          ...s.stats.byPlayer,
          [scorerId]: (s.stats.byPlayer[scorerId] || 0) + 1,
        },
      },
      undoStack: [
        ...s.undoStack.slice(-9),
        { scorerId, scoringSide, victimSide, prevVictimCups: prev },
      ],
    }))
  }

  const undo = () =>
    setState((s) => {
      if (s.undoStack.length === 0) return s
      const last = s.undoStack[s.undoStack.length - 1]
      const hits = { ...s.stats.byPlayer }
      hits[last.scorerId] = Math.max(0, (hits[last.scorerId] || 0) - 1)
      setRecent(null)
      return {
        ...s,
        cups: { ...s.cups, [last.victimSide]: last.prevVictimCups },
        stats: { byPlayer: hits },
        undoStack: s.undoStack.slice(0, -1),
      }
    })

  // Resolve the won match. `advance`: jump straight into the next playable match
  // (stay on Placar) instead of bouncing back to the bracket.
  const finishMatch = (advance) => {
    const winnerDupId = winnerSide === 'left' ? match.dupAId : match.dupBId
    const { bracket, champion } = recordResult(
      state.bracket,
      byId,
      state.currentMatchId,
      winnerDupId,
    )
    // Tournament over → fold this tournament's hits into the all-time MVP table (by name)
    // and archive a durable snapshot to disk (or buffer it until a folder connects).
    // Guard with !state.champion so finishing the 3rd-place match *after* the final
    // (champion already set) doesn't double-count MVP hits or re-archive.
    if (champion && !state.champion) {
      const merged = { ...allTime }
      for (const [pid, hits] of Object.entries(state.stats.byPlayer)) {
        const p = state.players.find((x) => x.id === pid)
        if (!p || p.isWO) continue
        merged[p.name] = (merged[p.name] || 0) + hits
      }
      setAllTime(merged)
      history.saveTournament(buildTournamentRecord(state, bracket, champion))
    }
    const next = !champion && advance ? nextPlayableMatch(bracket, byId) : null
    setRecent(null)
    setState((s) => ({
      ...s,
      bracket,
      champion,
      currentMatchId: next ? next.id : null,
      cups: { left: CUPS_PER_TEAM, right: CUPS_PER_TEAM },
      undoStack: [],
    }))
    if (!next) {
      setKiosk(false)
      go('bracket')
    }
    // else: stay here — the next match is already loaded in state.
  }

  const confirmVictory = () => finishMatch(false) // confirm + back to bracket
  const confirmAndNext = () => finishMatch(true) // confirm + load next match here

  // Will another match be ready right after this one resolves? Drives the modal CTA.
  let nextAfterWin = null
  if (winnerSide) {
    const winnerDupId = winnerSide === 'left' ? match.dupAId : match.dupBId
    const sim = recordResult(state.bracket, byId, state.currentMatchId, winnerDupId)
    nextAfterWin = sim.champion ? null : nextPlayableMatch(sim.bracket, byId)
  }

  // Refresh the key-listener handlers with the current closures/state.
  const leftPlayers = dupA?.playerIds || []
  const rightPlayers = dupB?.playerIds || []
  handlers.current = {
    live: !winnerSide,
    undo,
    confirm: winnerSide ? (nextAfterWin ? confirmAndNext : confirmVictory) : null,
    key: (k) => {
      if (winnerSide) return
      const map = { 1: ['left', 0], 2: ['left', 1], 3: ['right', 0], 4: ['right', 1] }
      const [sd, idx] = map[k]
      const pid = (sd === 'left' ? leftPlayers : rightPlayers)[idx]
      if (pid && !playerIsWO(pid)) score(sd, pid)
    },
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="taca-pulse h-2.5 w-2.5 rounded-full bg-copo" />
        <span className="font-mono text-xs tracking-widest text-copo">AO VIVO</span>
        <span className="font-mono text-xs text-gelo/40 ml-auto hidden sm:inline">
          PRIMEIRO A ZERAR OS COPOS VENCE
        </span>
        <button
          onClick={() => setSfxOn((v) => !v)}
          aria-label={sfxOn ? 'Desativar som' : 'Ativar som'}
          aria-pressed={sfxOn}
          className={[
            'ml-auto flex items-center gap-1.5 rounded-lg border border-linha bg-mata-2 px-3 py-1.5',
            'font-mono text-xs transition hover:border-gelo/40',
            sfxOn ? 'text-gelo/60 hover:text-gelo' : 'text-gelo/30 hover:text-gelo/60',
          ].join(' ')}
        >
          {sfxOn ? <Volume2 size={14} /> : <VolumeX size={14} />} SOM
        </button>
        {!kiosk && (
          <button
            onClick={() => setKiosk(true)}
            className="sm:ml-1 flex items-center gap-1.5 rounded-lg border border-linha
                       bg-mata-2 px-3 py-1.5 font-mono text-xs text-gelo/60
                       hover:text-gelo hover:border-gelo/40 transition"
          >
            <Maximize2 size={14} /> TELA CHEIA <span className="text-gelo/30">(F)</span>
          </button>
        )}
      </div>

      <MomentumBar
        phase={phase}
        leftName={dupA?.name}
        rightName={dupB?.name}
        cupsLeft={cups.left}
        cupsRight={cups.right}
        settled={!!winnerSide}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:gap-6">
        <TeamSide
          side="left"
          name={dupA?.name}
          remaining={cups.left}
          recent={recent}
          players={dupA?.playerIds || []}
          playerName={playerName}
          playerIsWO={playerIsWO}
          disabled={!!winnerSide}
          leading={leader === 'left'}
          onScore={(pid) => score('left', pid)}
        />
        <TeamSide
          side="right"
          name={dupB?.name}
          remaining={cups.right}
          recent={recent}
          players={dupB?.playerIds || []}
          playerName={playerName}
          playerIsWO={playerIsWO}
          disabled={!!winnerSide}
          leading={leader === 'right'}
          onScore={(pid) => score('right', pid)}
        />
      </div>

      <button
        onClick={undo}
        disabled={state.undoStack.length === 0}
        className="w-full flex items-center justify-center gap-3 rounded-xl border border-linha
                   bg-mata-2 px-6 py-5 font-display text-2xl text-gelo
                   enabled:hover:border-gelo/40 enabled:active:scale-[0.99] transition
                   disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Undo2 size={26} /> Desfazer Última Ação
        <kbd className="ml-1 hidden sm:inline-block rounded bg-black/25 px-1.5 py-0.5
                        font-mono text-sm text-gelo/60">Z</kbd>
      </button>

      {winnerSide && (
        <VictoryModal
          name={winnerSide === 'left' ? dupA?.name : dupB?.name}
          hasNext={!!nextAfterWin}
          onNext={confirmAndNext}
          onConfirm={confirmVictory}
          onUndo={undo}
        />
      )}

      <GifOverlay data={gif} />
    </div>
  )
}

// Centered situation gif (point / b2b / revenge / hat-trick). Pointer-events off
// so it never blocks the scoring buttons; pops, holds, fades (parent clears it).
function GifOverlay({ data }) {
  if (!data) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-60 flex items-center justify-center p-6">
      <img
        key={data.key}
        src={data.url}
        alt=""
        className="taca-gif-pop max-h-[60vh] max-w-[80vw] rounded-2xl border-4 border-dourado/80
                   shadow-2xl shadow-black/70"
      />
    </div>
  )
}

// The signature: a center-anchored momentum spine. Each side's fill grows out
// from the "VS" toward its edge as it knocks the opponent's cups — whoever
// reaches the rim wins. Readable as "who's ahead" from across the room.
function MomentumBar({ phase, leftName, rightName, cupsLeft, cupsRight, settled }) {
  const leftProgress = CUPS_PER_TEAM - cupsRight // cups left has knocked off right
  const rightProgress = CUPS_PER_TEAM - cupsLeft
  const lead = leftProgress - rightProgress
  const leader = settled || lead === 0 ? null : lead > 0 ? 'left' : 'right'
  const pct = (n) => `${(n / CUPS_PER_TEAM) * 100}%`

  return (
    <div className="rounded-xl border border-linha bg-mata-2 px-4 py-3 lg:px-6 lg:py-4">
      <div className="flex items-center justify-between gap-3">
        <span
          className={[
            'font-display text-sm sm:text-lg lg:text-2xl truncate flex-1',
            leader === 'left' ? 'text-copo taca-lead' : 'text-gelo/70',
          ].join(' ')}
        >
          {leftName || '—'}
        </span>
        <div className="flex flex-col items-center shrink-0 px-2">
          {phase && (
            <span className="font-mono text-[10px] lg:text-xs tracking-widest text-gelo/40 leading-none">
              {phase.toUpperCase()}
            </span>
          )}
          <span className="font-display text-lg sm:text-2xl lg:text-3xl text-gelo leading-tight">VS</span>
        </div>
        <span
          className={[
            'font-display text-sm sm:text-lg lg:text-2xl truncate flex-1 text-right',
            leader === 'right' ? 'text-dourado taca-lead' : 'text-gelo/70',
          ].join(' ')}
        >
          {rightName || '—'}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-1">
        <div className="flex-1 h-2.5 sm:h-3 lg:h-4 rounded-full bg-mata overflow-hidden flex justify-end">
          <div
            className="h-full bg-copo rounded-l-full transition-[width] duration-500 ease-out"
            style={{ width: pct(leftProgress) }}
          />
        </div>
        <span className="h-3 sm:h-4 lg:h-5 w-px bg-gelo/30 shrink-0" />
        <div className="flex-1 h-2.5 sm:h-3 lg:h-4 rounded-full bg-mata overflow-hidden">
          <div
            className="h-full bg-dourado rounded-r-full transition-[width] duration-500 ease-out"
            style={{ width: pct(rightProgress) }}
          />
        </div>
      </div>

      <p className="mt-2 text-center font-mono text-[11px] lg:text-sm tracking-wide text-gelo/50">
        {leader
          ? `${leader === 'left' ? leftName : rightName} lidera por ${Math.abs(lead)}`
          : 'Tudo igual — qualquer copo decide'}
      </p>
    </div>
  )
}

function TeamSide({
  side,
  name,
  remaining,
  recent,
  players,
  playerName,
  playerIsWO,
  disabled,
  leading,
  onScore,
}) {
  const accent = side === 'left' ? 'text-copo' : 'text-dourado'
  return (
    <section
      className={[
        'rounded-xl border bg-mata-2 p-3 sm:p-5 lg:p-6 flex flex-col items-center transition-colors',
        leading ? (side === 'left' ? 'border-copo/60' : 'border-dourado/60') : 'border-linha',
      ].join(' ')}
    >
      <h2 className="font-display text-lg sm:text-2xl lg:text-3xl xl:text-4xl text-center text-gelo leading-tight line-clamp-2 min-h-[2.5rem] lg:min-h-[3.5rem]">
        {name || '—'}
      </h2>
      <div
        key={remaining}
        className={`taca-bump font-mono font-bold text-6xl sm:text-7xl lg:text-8xl xl:text-9xl ${accent} ${leading ? 'taca-lead' : ''} my-2`}
      >
        {String(remaining).padStart(2, '0')}
      </div>
      <p className="font-mono text-[10px] lg:text-xs tracking-widest text-gelo/40 -mt-1 mb-3">
        {leading ? 'NA FRENTE' : 'COPOS RESTANTES'}
      </p>

      <CupRack side={side} remaining={remaining} recent={recent} />

      <div className="mt-4 lg:mt-6 w-full space-y-2.5 lg:space-y-3">
        {players.map((pid, idx) => {
          const wo = playerIsWO(pid)
          const keyHint = side === 'left' ? idx + 1 : idx + 3 // 1/2 left, 3/4 right
          return (
            <button
              key={pid}
              onClick={() => onScore(pid)}
              disabled={disabled || wo}
              className={[
                'w-full rounded-xl px-3 py-6 sm:py-8 lg:py-10 font-bold text-lg sm:text-2xl lg:text-3xl',
                'flex items-center justify-center gap-2 transition active:scale-[0.97]',
                wo
                  ? 'bg-mata text-gelo/30 cursor-not-allowed'
                  : 'bg-copo text-branco enabled:hover:bg-copo-glow shadow-lg shadow-copo/20',
                'disabled:opacity-50',
              ].join(' ')}
            >
              <Target size={24} className="shrink-0" />
              <span className="truncate">{playerName(pid)}</span>
              <span className="font-mono shrink-0">+1</span>
              {!wo && idx < 2 && (
                <kbd className="ml-1 hidden sm:inline-block rounded bg-black/25 px-1.5 py-0.5
                                font-mono text-xs text-branco/70">
                  {keyHint}
                </kbd>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// 6 cups in a 3-2-1 rack. Out cups (index < 6-remaining) gray + red X.
function CupRack({ side, remaining, recent }) {
  const out = CUPS_PER_TEAM - remaining
  const rows = [
    [0, 1, 2],
    [3, 4],
    [5],
  ]
  return (
    <div className="flex flex-col items-center gap-1.5 lg:gap-2.5">
      {rows.map((row, ri) => (
        <div key={ri} className="flex gap-1.5 lg:gap-2.5">
          {row.map((idx) => {
            const isOut = idx < out
            const justOut = recent === `${side}:${idx}`
            return (
              <div
                key={idx}
                className={[
                  'relative h-7 w-7 sm:h-9 sm:w-9 lg:h-14 lg:w-14 xl:h-16 xl:w-16',
                  'rounded-b-full rounded-t-md border-2 flex items-center justify-center',
                  isOut
                    ? 'bg-inativo/30 border-inativo'
                    : 'bg-copo border-copo-glow shadow-md shadow-copo/30 lg:shadow-lg lg:shadow-copo/40',
                  justOut ? 'taca-cup-out' : '',
                ].join(' ')}
              >
                {isOut && <X className="text-copo h-4 w-4 lg:h-7 lg:w-7" strokeWidth={3} />}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function VictoryModal({ name, hasNext, onNext, onConfirm, onUndo }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="taca-pop w-full max-w-md rounded-2xl border border-dourado bg-mata-2 p-8 text-center taca-gold">
        <img src="/taca-logo.png" alt="" className="mx-auto h-24 w-auto drop-shadow-xl" />
        <p className="font-mono text-xs tracking-widest text-dourado mt-3">VITÓRIA DA DUPLA</p>
        <p className="font-display text-4xl text-gelo mt-1 break-words">{name}</p>

        {hasNext ? (
          <>
            <button
              onClick={onNext}
              className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl bg-dourado
                         px-6 py-4 font-display text-2xl text-mata
                         hover:brightness-105 active:scale-[0.99] transition"
            >
              Próximo Jogo <ArrowRight size={26} />
              <kbd className="ml-1 rounded bg-black/15 px-1.5 py-0.5 font-mono text-sm">↵</kbd>
            </button>
            <button
              onClick={onConfirm}
              className="mt-2 w-full rounded-lg px-4 py-2.5 font-bold text-gelo/70 hover:text-gelo
                         border border-linha"
            >
              Salvar e ver o chaveamento
            </button>
          </>
        ) : (
          <button
            onClick={onConfirm}
            className="mt-6 w-full rounded-xl bg-dourado px-6 py-4 font-display text-2xl text-mata
                       hover:brightness-105 active:scale-[0.99] transition"
          >
            Confirmar e Avançar
            <kbd className="ml-2 rounded bg-black/15 px-1.5 py-0.5 font-mono text-sm">↵</kbd>
          </button>
        )}

        <button
          onClick={onUndo}
          className="mt-2 w-full rounded-lg px-4 py-2 font-bold text-gelo/60 hover:text-gelo"
        >
          Foi engano — desfazer
        </button>
      </div>
    </div>
  )
}
