// Chaveamento — single-elimination bracket (4/8/16). Ready match shows "INICIAR
// JOGO", future matches locked, winners highlighted. See CLAUDE.md §4B.
import { useEffect, useRef, useState } from 'react'
import { Play, Lock, Crown, RotateCcw, Pencil, Check, X, ArrowLeftRight } from 'lucide-react'
import { SectionHead } from './Setup.jsx'
import {
  CUPS_PER_TEAM,
  roundLabel,
  nextPlayableMatch,
  hasPlayedMatch,
  reseedRound0,
} from '../engine.js'

export default function Bracket({ ctx }) {
  const { state, setState, go, resetTournament } = ctx
  const { bracket, champion } = state
  const edition = state.tournamentName?.trim()
  const nextRef = useRef(null)
  // Edit mode: a local working copy of the round-0 slot list (length = bracket.size).
  // Slot p maps to match Math.floor(p/2), side A if even / B if odd.
  const [seed, setSeed] = useState(null)
  const editing = seed != null

  const onReset = () => {
    if (
      window.confirm(
        'Reiniciar torneio? O chaveamento e o placar atual serão apagados. ' +
          'O ranking histórico e o de todos os tempos são mantidos.',
      )
    )
      resetTournament()
  }

  // Bring the next playable match into view whenever the bracket advances, so the
  // operator never hunts for "what's next" after a result.
  useEffect(() => {
    nextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [state.bracket, state.currentMatchId, state.champion])

  if (!bracket) {
    return (
      <div className="space-y-8">
        <SectionHead kicker="PASSO 2" title="Chaveamento" />
        <Empty>
          Nenhum campeonato gerado. Volte em <b className="text-dourado">Configuração</b> e gere o
          chaveamento.
        </Empty>
      </div>
    )
  }

  const byId = Object.fromEntries(state.duplas.map((d) => [d.id, d]))
  const nameOf = (id) => byId[id]?.name || '—'
  const isWO = (id) => id == null || byId[id]?.isWO
  // W.O. slot duplas aren't kept in state.duplas, so byId misses them. Label by intent.
  const slotName = (id) => byId[id]?.name || (id ? 'W.O.' : 'Vazio')
  // The single match the operator should play next (used to highlight + scroll).
  const nextId = nextPlayableMatch(bracket, byId)?.id ?? null
  // Re-seeding wipes downstream results, so only allow it before any real game is played.
  const played = hasPlayedMatch(bracket, byId)

  const startEdit = () => {
    const arr = []
    bracket.rounds[0].forEach((m) => {
      arr.push(m.dupAId)
      arr.push(m.dupBId)
    })
    setSeed(arr)
  }
  const cancelEdit = () => setSeed(null)
  // Pick a dupla for slot `pos`. If it already sits elsewhere, swap the two slots so the
  // real-dupla / W.O. counts stay intact (operator can only rearrange, never duplicate).
  const assignSlot = (pos, nextId) => {
    setSeed((prev) => {
      const next = [...prev]
      const q = next.indexOf(nextId)
      if (q === -1) next[pos] = nextId
      else [next[pos], next[q]] = [next[q], next[pos]]
      return next
    })
  }
  const saveEdit = () => {
    // Re-seeding wipes every downstream result + the live placar. Warn first when
    // there are real games already played (operator chose to keep editing unlocked).
    if (
      played &&
      !window.confirm(
        'Salvar refaz a 1ª rodada e APAGA todos os resultados já jogados, ' +
          'o placar atual e a disputa de 3º lugar. O ranking histórico é mantido. Continuar?',
      )
    )
      return
    const newBracket = reseedRound0(bracket, byId, seed)
    setState((s) => ({
      ...s,
      bracket: newBracket,
      champion: null,
      currentMatchId: null,
      cups: { left: CUPS_PER_TEAM, right: CUPS_PER_TEAM },
      undoStack: [],
    }))
    setSeed(null)
  }

  const iniciar = (matchId) => {
    setState((s) => ({
      ...s,
      currentMatchId: matchId,
      cups: { left: CUPS_PER_TEAM, right: CUPS_PER_TEAM },
      undoStack: [],
    }))
    go('scoreboard')
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <SectionHead
          kicker="PASSO 2"
          title="Chaveamento"
          sub={`Mata-mata de ${bracket.size} duplas. Toque em INICIAR JOGO na partida liberada.`}
        />
        <div className="mt-1 shrink-0 flex items-center gap-2">
          {!editing && (
            <button
              onClick={startEdit}
              title={
                played
                  ? 'Editar a 1ª rodada apaga os resultados já jogados (confirma antes de salvar).'
                  : undefined
              }
              className="flex items-center gap-1.5 rounded-lg border border-linha bg-mata-2
                         px-3 py-2 font-mono text-xs text-gelo/50 hover:text-dourado hover:border-dourado/50 transition"
            >
              <Pencil size={14} /> Editar
            </button>
          )}
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg border border-linha bg-mata-2
                       px-3 py-2 font-mono text-xs text-gelo/50 hover:text-copo hover:border-copo/50 transition"
          >
            <RotateCcw size={14} /> Reiniciar
          </button>
        </div>
      </div>

      {champion && (
        <ChampionBanner
          name={nameOf(champion)}
          edition={edition}
          onRanking={() => go('ranking')}
          onReset={onReset}
        />
      )}

      {editing && (
        <EditPanel
          seed={seed}
          slotName={slotName}
          assignSlot={assignSlot}
          onSave={saveEdit}
          onCancel={cancelEdit}
        />
      )}

      <div className={['flex gap-5 overflow-x-auto pb-4', editing ? 'hidden' : ''].join(' ')}>
        {bracket.rounds.map((round, ri) => (
          <div key={ri} className="shrink-0 w-64 flex flex-col">
            <h3 className="font-display text-lg text-dourado mb-3 text-center">
              {roundLabel(bracket, ri)}
            </h3>
            <div className="flex flex-col justify-around flex-1 gap-4">
              {round.map((m) => {
                const aKnown = m.dupAId != null
                const bKnown = m.dupBId != null
                const ready =
                  !m.winnerId && aKnown && bKnown && !isWO(m.dupAId) && !isWO(m.dupBId)
                const locked = !m.winnerId && (!aKnown || !bKnown)
                const live = state.currentMatchId === m.id
                const isNext = m.id === nextId && !live
                return (
                  <MatchCard
                    key={m.id}
                    cardRef={isNext ? nextRef : null}
                    hasPrev={ri > 0}
                    hasNext={ri < bracket.rounds.length - 1}
                    aName={nameOf(m.dupAId)}
                    bName={nameOf(m.dupBId)}
                    aWin={m.winnerId && m.winnerId === m.dupAId}
                    bWin={m.winnerId && m.winnerId === m.dupBId}
                    decided={!!m.winnerId}
                    ready={ready}
                    locked={locked}
                    live={live}
                    isNext={isNext}
                    onIniciar={() => iniciar(m.id)}
                  />
                )
              })}
            </div>
          </div>
        ))}

        {bracket.thirdPlace && (
          <ThirdPlaceColumn
            tp={bracket.thirdPlace}
            nameOf={nameOf}
            isWO={isWO}
            live={state.currentMatchId === bracket.thirdPlace.id}
            isNext={bracket.thirdPlace.id === nextId && state.currentMatchId !== bracket.thirdPlace.id}
            onIniciar={() => iniciar(bracket.thirdPlace.id)}
          />
        )}
      </div>
    </div>
  )
}

// Standalone "3º Lugar" match between the two semifinal losers. Same card as the
// bracket, but its own column (it feeds nothing, so no connector stubs).
function ThirdPlaceColumn({ tp, nameOf, isWO, live, isNext, onIniciar }) {
  const aKnown = tp.dupAId != null
  const bKnown = tp.dupBId != null
  const ready = !tp.winnerId && aKnown && bKnown && !isWO(tp.dupAId) && !isWO(tp.dupBId)
  const locked = !tp.winnerId && (!aKnown || !bKnown)
  return (
    <div className="shrink-0 w-64 flex flex-col">
      <h3 className="font-display text-lg text-gelo/70 mb-3 text-center">3º Lugar</h3>
      <div className="flex flex-col justify-around flex-1 gap-4">
        <MatchCard
          hasPrev={false}
          hasNext={false}
          aName={nameOf(tp.dupAId)}
          bName={nameOf(tp.dupBId)}
          aWin={tp.winnerId && tp.winnerId === tp.dupAId}
          bWin={tp.winnerId && tp.winnerId === tp.dupBId}
          decided={!!tp.winnerId}
          ready={ready}
          locked={locked}
          live={live}
          isNext={isNext}
          onIniciar={onIniciar}
        />
      </div>
    </div>
  )
}

// Round-0 seeding editor. Each slot is a <select> over the same pool of duplas; picking a
// dupla that already sits in another slot swaps the two, so the operator only rearranges.
function EditPanel({ seed, slotName, assignSlot, onSave, onCancel }) {
  const pool = [...new Set(seed)] // unique slot occupants (duplas + W.O.)
  const matchCount = seed.length / 2
  return (
    <div className="rounded-xl border border-dourado/60 bg-mata-2 p-4 space-y-4">
      <div className="flex items-center gap-2 font-display text-lg text-dourado">
        <ArrowLeftRight size={18} /> Editar confrontos — 1ª rodada
      </div>
      <p className="font-mono text-xs text-gelo/50">
        Escolha quem joga em cada vaga. Selecionar uma dupla já posicionada troca as duas de
        lugar. Confira antes de salvar — salvar recalcula o restante do chaveamento.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: matchCount }, (_, i) => (
          <div key={i} className="rounded-lg border border-linha bg-mata p-3 space-y-2">
            <div className="font-mono text-[10px] tracking-widest text-gelo/40">
              CONFRONTO {i + 1}
            </div>
            <SlotSelect
              value={seed[i * 2]}
              pool={pool}
              slotName={slotName}
              onChange={(id) => assignSlot(i * 2, id)}
            />
            <div className="text-center font-display text-xs text-copo">VS</div>
            <SlotSelect
              value={seed[i * 2 + 1]}
              pool={pool}
              slotName={slotName}
              onChange={(id) => assignSlot(i * 2 + 1, id)}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border border-gelo/30 px-4 py-2
                     font-bold text-gelo hover:border-gelo/60 transition"
        >
          <X size={16} /> Cancelar
        </button>
        <button
          onClick={onSave}
          className="flex items-center gap-1.5 rounded-lg bg-dourado px-4 py-2 font-bold
                     text-mata hover:brightness-105"
        >
          <Check size={16} /> Salvar chaveamento
        </button>
      </div>
    </div>
  )
}

function SlotSelect({ value, pool, slotName, onChange }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-linha bg-mata-2 px-3 py-2 font-medium text-gelo
                 focus:border-dourado focus:outline-none"
    >
      {pool.map((id) => (
        <option key={id ?? 'empty'} value={id ?? ''}>
          {slotName(id)}
        </option>
      ))}
    </select>
  )
}

function MatchCard({ cardRef, hasPrev, hasNext, aName, bName, aWin, bWin, decided, ready, locked, live, isNext, onIniciar }) {
  return (
    <div ref={cardRef} className="relative">
      {/* Connector stubs bridging the gap-5 columns — reads as a bracket tree. */}
      {hasPrev && (
        <span aria-hidden className="absolute top-1/2 -left-5 h-px w-5 bg-linha" />
      )}
      {hasNext && (
        <span aria-hidden className="absolute top-1/2 -right-5 h-px w-5 bg-linha" />
      )}
      <div
        className={[
          'rounded-lg border bg-mata-2 overflow-hidden transition',
          live
            ? 'border-copo'
            : isNext
              ? 'border-dourado ring-2 ring-dourado/50 taca-pulse'
              : ready
                ? 'border-dourado/60'
                : 'border-linha',
        ].join(' ')}
      >
        {isNext && (
          <div className="bg-dourado/15 px-3 py-1 text-center font-mono text-[10px] tracking-widest text-dourado">
            PRÓXIMO JOGO
          </div>
        )}
        <Side name={aName} win={aWin} dim={decided && !aWin} />
        <div className="h-px bg-linha" />
        <Side name={bName} win={bWin} dim={decided && !bWin} />

        {ready && (
          <button
            onClick={onIniciar}
            className="w-full flex items-center justify-center gap-2 bg-copo px-3 py-2
                       font-bold text-branco hover:bg-copo-glow active:scale-[0.98] transition"
          >
            <Play size={16} fill="currentColor" /> {live ? 'Continuar' : 'Iniciar Jogo'}
          </button>
        )}
        {locked && (
          <div className="flex items-center justify-center gap-2 bg-mata px-3 py-2 text-gelo/35
                          font-mono text-xs">
            <Lock size={13} /> Aguardando
          </div>
        )}
      </div>
    </div>
  )
}

function Side({ name, win, dim }) {
  return (
    <div
      className={[
        'flex items-center gap-2 px-3 py-2.5',
        win ? 'bg-dourado/10' : '',
        dim ? 'opacity-45' : '',
      ].join(' ')}
    >
      {win && <Crown size={15} className="text-dourado shrink-0" />}
      <span className={['font-medium truncate', win ? 'text-dourado' : 'text-gelo'].join(' ')}>
        {name}
      </span>
    </div>
  )
}

function ChampionBanner({ name, edition, onRanking, onReset }) {
  return (
    <div className="taca-pop rounded-xl border border-dourado bg-dourado/10 p-5 text-center taca-gold">
      <img src="/taca-logo.png" alt="" className="mx-auto h-20 w-auto drop-shadow-lg" />
      <Crown size={32} className="mx-auto text-dourado mt-1" />
      {edition && <p className="font-display text-xl text-gelo mt-1">{edition}</p>}
      <p className="font-mono text-xs tracking-widest text-dourado mt-2">CAMPEÃO DO TORNEIO</p>
      <p className="font-display text-3xl text-gelo mt-1">{name}</p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={onRanking}
          className="rounded-lg bg-dourado px-4 py-2 font-bold text-mata hover:brightness-105"
        >
          Ver Ranking MVP
        </button>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-lg border border-gelo/30 px-4 py-2
                     font-bold text-gelo hover:border-gelo/60 transition"
        >
          <RotateCcw size={16} /> Novo Torneio
        </button>
      </div>
    </div>
  )
}

function Empty({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-linha bg-mata-2 p-8 text-center text-gelo/60">
      {children}
    </div>
  )
}
