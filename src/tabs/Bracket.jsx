// Chaveamento — double elimination. Fully manual drag & drop seeding.
// Upper bracket + lower bracket + Grande Final. Operator drags duplas from pool into slots.
import { useEffect, useRef, useState } from 'react'
import {
  Play, Lock, Crown, RotateCcw, Plus, ArrowDown, Trophy, GripVertical,
} from 'lucide-react'
import { SectionHead } from './Setup.jsx'
import {
  CUPS_PER_TEAM,
  upperRoundLabel,
  lowerRoundLabel,
  nextPlayableMatch,
  addMatchToRound,
  addRound,
  sendLoserToLower,
  assignDuplaToSlot,
  swapDuplaSlots,
} from '../engine.js'

export default function Bracket({ ctx }) {
  const { state, setState, go, resetTournament } = ctx
  const { bracket, champion } = state
  const edition = state.tournamentName?.trim()
  const nextRef = useRef(null)

  // dragState: what is being dragged
  // { duplaId, fromPool } | { duplaId, fromMatchId, fromSide }
  const [dragState, setDragState] = useState(null)
  // dragOver: which slot is being hovered
  // { matchId, side } | 'pool' | null
  const [dragOver, setDragOver] = useState(null)

  const onReset = () => {
    if (
      window.confirm(
        'Reiniciar torneio? O chaveamento e o placar atual serão apagados. ' +
          'O ranking histórico e o de todos os tempos são mantidos.',
      )
    )
      resetTournament()
  }

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

  const realById = Object.fromEntries(state.duplas.map((d) => [d.id, d]))
  const byId = { ...realById }
  const addWO = (id) => {
    if (id != null && !byId[id]) byId[id] = { id, name: 'W.O.', isWO: true }
  }
  ;(bracket.upper || []).forEach((r) => r.forEach((m) => (addWO(m.dupAId), addWO(m.dupBId))))
  ;(bracket.lower || []).forEach((r) => r.forEach((m) => (addWO(m.dupAId), addWO(m.dupBId))))
  if (bracket.grandFinal) { addWO(bracket.grandFinal.dupAId); addWO(bracket.grandFinal.dupBId) }

  const nameOf = (id) => byId[id]?.name || '—'
  const isWO = (id) => id == null || byId[id]?.isWO
  const nextId = nextPlayableMatch(bracket, byId)?.id ?? null
  const realDuplas = state.duplas

  // Compute placed dupla IDs across all slots
  const placedIds = new Set()
  const noteId = (id) => { if (id && realById[id]) placedIds.add(id) }
  ;(bracket.upper || []).forEach((r) => r.forEach((m) => (noteId(m.dupAId), noteId(m.dupBId))))
  ;(bracket.lower || []).forEach((r) => r.forEach((m) => (noteId(m.dupAId), noteId(m.dupBId))))
  if (bracket.grandFinal) { noteId(bracket.grandFinal.dupAId); noteId(bracket.grandFinal.dupBId) }

  const lowerDuplaIds = new Set()
  ;(bracket.lower || []).forEach((r) => r.forEach((m) => {
    if (m.dupAId) lowerDuplaIds.add(m.dupAId)
    if (m.dupBId) lowerDuplaIds.add(m.dupBId)
  }))

  // --- match actions ---
  const iniciar = (matchId) => {
    setState((s) => ({
      ...s,
      currentMatchId: matchId,
      cups: { left: CUPS_PER_TEAM, right: CUPS_PER_TEAM },
      undoStack: [],
    }))
    go('scoreboard')
  }

  const onAddMatch = (track, roundIdx) => {
    setState((s) => ({ ...s, bracket: addMatchToRound(s.bracket, track, roundIdx) }))
  }

  const onAddRound = (track) => {
    setState((s) => ({ ...s, bracket: addRound(s.bracket, track) }))
  }

  const onSendToLower = (upperMatchId) => {
    setState((s) => ({ ...s, bracket: sendLoserToLower(s.bracket, upperMatchId) }))
  }

  // --- drag & drop ---
  const handlePoolDragStart = (duplaId) => {
    setDragState({ duplaId, fromPool: true })
  }

  const handleSlotDragStart = (duplaId, matchId, side) => {
    if (!duplaId) return
    setDragState({ duplaId, fromPool: false, fromMatchId: matchId, fromSide: side })
  }

  const handleDragEnd = () => {
    setDragState(null)
    setDragOver(null)
  }

  const handleDropOnSlot = (targetMatchId, targetSide) => {
    if (!dragState) return
    setState((s) => {
      let newBracket
      if (dragState.fromPool) {
        newBracket = assignDuplaToSlot(s.bracket, targetMatchId, targetSide, dragState.duplaId)
      } else {
        newBracket = swapDuplaSlots(
          s.bracket,
          dragState.fromMatchId, dragState.fromSide,
          targetMatchId, targetSide,
        )
      }
      return { ...s, bracket: newBracket }
    })
    setDragState(null)
    setDragOver(null)
  }

  const handleDropOnPool = (e) => {
    e.preventDefault()
    if (!dragState || dragState.fromPool) { setDragState(null); setDragOver(null); return }
    setState((s) => ({
      ...s,
      bracket: assignDuplaToSlot(s.bracket, dragState.fromMatchId, dragState.fromSide, null),
    }))
    setDragState(null)
    setDragOver(null)
  }

  const dragProps = {
    dragState, dragOver, setDragOver,
    onSlotDragStart: handleSlotDragStart,
    onSlotDrop: handleDropOnSlot,
    onDragEnd: handleDragEnd,
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <SectionHead
          kicker="PASSO 2"
          title="Chaveamento"
          sub={`Dupla eliminação de ${bracket.size} duplas. Arraste as duplas para os confrontos.`}
        />
        <div className="mt-1 shrink-0">
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

      {/* DUPLAS POOL */}
      <DuplasPool
        duplas={realDuplas}
        placedIds={placedIds}
        dragState={dragState}
        isDragOver={dragOver === 'pool'}
        onDragStart={handlePoolDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => { e.preventDefault(); setDragOver('pool') }}
        onDragLeave={() => setDragOver(null)}
        onDrop={handleDropOnPool}
      />

      <div className="space-y-10">
        {/* UPPER BRACKET */}
        <TrackSection
          label="Chave Superior"
          kicker="UPPER BRACKET — WINNERS"
          accentClass="text-dourado"
          borderClass="border-dourado/40"
          rounds={bracket.upper || []}
          roundLabelFn={(ri) => upperRoundLabel(bracket, ri)}
          track="upper"
          nameOf={nameOf}
          isWO={isWO}
          nextId={nextId}
          nextRef={nextRef}
          currentMatchId={state.currentMatchId}
          lowerDuplaIds={lowerDuplaIds}
          onIniciar={iniciar}
          onAddMatch={onAddMatch}
          onAddRound={onAddRound}
          onSendToLower={onSendToLower}
          dragProps={dragProps}
        />

        {/* LOWER BRACKET */}
        <TrackSection
          label="Chave Inferior"
          kicker="LOWER BRACKET — REPESCAGEM"
          accentClass="text-copo"
          borderClass="border-copo/40"
          rounds={bracket.lower || []}
          roundLabelFn={(ri) => lowerRoundLabel(bracket, ri)}
          track="lower"
          nameOf={nameOf}
          isWO={isWO}
          nextId={nextId}
          nextRef={nextRef}
          currentMatchId={state.currentMatchId}
          lowerDuplaIds={lowerDuplaIds}
          onIniciar={iniciar}
          onAddMatch={onAddMatch}
          onAddRound={onAddRound}
          onSendToLower={null}
          dragProps={dragProps}
        />

        {/* GRANDE FINAL */}
        {bracket.grandFinal && (
          <GrandFinalSection
            match={bracket.grandFinal}
            nameOf={nameOf}
            isWO={isWO}
            live={state.currentMatchId === bracket.grandFinal.id}
            isNext={bracket.grandFinal.id === nextId && state.currentMatchId !== bracket.grandFinal.id}
            nextRef={bracket.grandFinal.id === nextId ? nextRef : null}
            onIniciar={() => iniciar(bracket.grandFinal.id)}
            dragProps={dragProps}
          />
        )}
      </div>
    </div>
  )
}

// Pool of all duplas — drag source + drop target (to unplace).
function DuplasPool({ duplas, placedIds, dragState, isDragOver, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }) {
  const unplaced = duplas.filter((d) => !placedIds.has(d.id))
  const placed = duplas.filter((d) => placedIds.has(d.id))

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        'rounded-xl border p-3 transition-colors',
        isDragOver && dragState && !dragState.fromPool
          ? 'border-copo/60 bg-copo/5'
          : 'border-linha bg-mata-2',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 mb-2">
        <p className="font-mono text-[10px] tracking-widest text-gelo/40">DUPLAS</p>
        {isDragOver && dragState && !dragState.fromPool && (
          <p className="font-mono text-[10px] text-copo/70">Solte aqui para remover do chaveamento</p>
        )}
        {unplaced.length === 0 && duplas.length > 0 && (
          <p className="font-mono text-[10px] text-gelo/30">Todas as duplas estão no chaveamento</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {unplaced.map((d) => (
          <DuplaChip key={d.id} dupla={d} placed={false} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        ))}
        {placed.map((d) => (
          <DuplaChip key={d.id} dupla={d} placed={true} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        ))}
        {duplas.length === 0 && (
          <p className="font-mono text-xs text-gelo/30">Nenhuma dupla formada ainda.</p>
        )}
      </div>
    </div>
  )
}

function DuplaChip({ dupla, placed, onDragStart, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(dupla.id)}
      onDragEnd={onDragEnd}
      className={[
        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium text-sm cursor-grab active:cursor-grabbing select-none transition',
        placed
          ? 'border-linha bg-mata text-gelo/40'
          : 'border-dourado/50 bg-mata-2 text-gelo hover:border-dourado hover:bg-mata',
      ].join(' ')}
    >
      <GripVertical size={13} className="shrink-0 opacity-50" />
      {dupla.name}
    </div>
  )
}

function TrackSection({
  label, kicker, accentClass, borderClass,
  rounds, roundLabelFn, track,
  nameOf, isWO, nextId, nextRef, currentMatchId, lowerDuplaIds,
  onIniciar, onAddMatch, onAddRound, onSendToLower,
  dragProps,
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-gelo/40">{kicker}</p>
          <h3 className={`font-display text-xl ${accentClass}`}>{label}</h3>
        </div>
        <button
          onClick={() => onAddRound(track)}
          className={`flex items-center gap-1.5 rounded-lg border ${borderClass} bg-mata-2
                     px-3 py-1.5 font-mono text-[11px] text-gelo/50 hover:text-gelo transition`}
        >
          <Plus size={12} /> Nova Fase
        </button>
      </div>

      {rounds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-linha bg-mata-2 p-6 text-center">
          <p className="font-mono text-xs text-gelo/40 mb-3">
            {track === 'lower'
              ? 'Lower bracket vazio. Use → Lower nos jogos do Upper ou adicione uma fase.'
              : 'Sem fases no bracket.'}
          </p>
          <button
            onClick={() => onAddRound(track)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-linha
                       bg-mata px-4 py-2 font-mono text-xs text-gelo/60 hover:text-gelo transition"
          >
            <Plus size={13} /> Adicionar fase
          </button>
        </div>
      ) : (
        <div className="flex gap-5 overflow-x-auto pb-4">
          {rounds.map((round, ri) => {
            const hasNext = ri < rounds.length - 1
            return (
              <div key={ri} className="shrink-0 w-64 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`font-display text-lg ${accentClass}`}>{roundLabelFn(ri)}</h4>
                  <button
                    onClick={() => onAddMatch(track, ri)}
                    className="flex items-center gap-1 rounded border border-linha bg-mata-2
                               px-2 py-1 font-mono text-[10px] text-gelo/40 hover:text-gelo transition"
                  >
                    <Plus size={10} /> Jogo
                  </button>
                </div>
                <div className="flex flex-col gap-4 flex-1">
                  {round.map((m) => {
                    const aKnown = m.dupAId != null
                    const bKnown = m.dupBId != null
                    const ready = !m.winnerId && aKnown && bKnown && !isWO(m.dupAId) && !isWO(m.dupBId)
                    const locked = !m.winnerId && (!aKnown || !bKnown)
                    const live = currentMatchId === m.id
                    const isNextM = m.id === nextId && !live

                    let loserId = null
                    if (track === 'upper' && m.winnerId) {
                      loserId = m.winnerId === m.dupAId ? m.dupBId : m.dupAId
                    }
                    const loserInLower = loserId && lowerDuplaIds.has(loserId)

                    return (
                      <MatchCard
                        key={m.id}
                        cardRef={isNextM ? nextRef : null}
                        hasPrev={ri > 0}
                        hasNext={hasNext}
                        match={m}
                        nameOf={nameOf}
                        aWin={m.winnerId && m.winnerId === m.dupAId}
                        bWin={m.winnerId && m.winnerId === m.dupBId}
                        decided={!!m.winnerId}
                        ready={ready}
                        locked={locked}
                        live={live}
                        isNext={isNextM}
                        onIniciar={() => onIniciar(m.id)}
                        showSendToLower={track === 'upper' && !!loserId && !loserInLower && !!onSendToLower}
                        loserInLower={loserInLower}
                        loserName={loserId ? nameOf(loserId) : null}
                        onSendToLower={onSendToLower ? () => onSendToLower(m.id) : null}
                        dragProps={dragProps}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GrandFinalSection({ match, nameOf, isWO, live, isNext, nextRef, onIniciar, dragProps }) {
  if (!match) return null
  const aKnown = match.dupAId != null
  const bKnown = match.dupBId != null
  const ready = !match.winnerId && aKnown && bKnown && !isWO(match.dupAId) && !isWO(match.dupBId)
  const locked = !match.winnerId && (!aKnown || !bKnown)

  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-[10px] tracking-widest text-gelo/40">GRANDE FINAL</p>
        <h3 className="font-display text-xl text-dourado">Grande Final</h3>
      </div>
      <div className="flex justify-center">
        <div className="w-72">
          <MatchCard
            cardRef={nextRef}
            hasPrev={false}
            hasNext={false}
            match={match}
            nameOf={nameOf}
            aWin={match.winnerId && match.winnerId === match.dupAId}
            bWin={match.winnerId && match.winnerId === match.dupBId}
            decided={!!match.winnerId}
            ready={ready}
            locked={locked}
            live={live}
            isNext={isNext}
            onIniciar={onIniciar}
            showSendToLower={false}
            loserInLower={false}
            loserName={null}
            onSendToLower={null}
            isGrandFinal
            dragProps={dragProps}
          />
        </div>
      </div>
    </div>
  )
}

function MatchCard({
  cardRef, hasPrev, hasNext,
  match, nameOf,
  aWin, bWin, decided, ready, locked, live, isNext, isGrandFinal,
  onIniciar,
  showSendToLower, loserInLower, loserName, onSendToLower,
  dragProps,
}) {
  const { dragState, dragOver, setDragOver, onSlotDragStart, onSlotDrop, onDragEnd } = dragProps
  const isDragActive = !!dragState

  const isAOver = dragOver?.matchId === match.id && dragOver?.side === 'a'
  const isBOver = dragOver?.matchId === match.id && dragOver?.side === 'b'

  return (
    <div ref={cardRef} className="relative">
      {hasPrev && <span aria-hidden className="absolute top-1/2 -left-5 h-px w-5 bg-linha" />}
      {hasNext && <span aria-hidden className="absolute top-1/2 -right-5 h-px w-5 bg-linha" />}
      <div
        className={[
          'rounded-lg border bg-mata-2 overflow-hidden transition',
          live
            ? 'border-copo'
            : isNext
              ? 'border-dourado ring-2 ring-dourado/50 taca-pulse'
              : isGrandFinal
                ? 'border-dourado/70'
                : ready
                  ? 'border-dourado/60'
                  : 'border-linha',
        ].join(' ')}
      >
        {isGrandFinal && !isNext && (
          <div className="bg-dourado/10 px-3 py-1 text-center font-mono text-[10px] tracking-widest text-dourado">
            GRANDE FINAL
          </div>
        )}
        {isNext && (
          <div className="bg-dourado/15 px-3 py-1 text-center font-mono text-[10px] tracking-widest text-dourado">
            PRÓXIMO JOGO
          </div>
        )}

        <DragSlot
          duplaId={match.dupAId}
          name={nameOf(match.dupAId)}
          win={aWin}
          dim={decided && !aWin}
          isDragActive={isDragActive}
          isOver={isAOver}
          onDragStart={() => onSlotDragStart(match.dupAId, match.id, 'a')}
          onDragOver={(e) => { e.preventDefault(); setDragOver({ matchId: match.id, side: 'a' }) }}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => onSlotDrop(match.id, 'a')}
          onDragEnd={onDragEnd}
        />
        <div className="h-px bg-linha" />
        <DragSlot
          duplaId={match.dupBId}
          name={nameOf(match.dupBId)}
          win={bWin}
          dim={decided && !bWin}
          isDragActive={isDragActive}
          isOver={isBOver}
          onDragStart={() => onSlotDragStart(match.dupBId, match.id, 'b')}
          onDragOver={(e) => { e.preventDefault(); setDragOver({ matchId: match.id, side: 'b' }) }}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => onSlotDrop(match.id, 'b')}
          onDragEnd={onDragEnd}
        />

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

        {showSendToLower && (
          <button
            onClick={onSendToLower}
            className="w-full flex items-center justify-center gap-1.5 border-t border-linha
                       bg-mata px-3 py-1.5 font-mono text-[11px] text-gelo/45
                       hover:text-copo hover:bg-copo/5 transition"
          >
            <ArrowDown size={12} /> {loserName} → Lower
          </button>
        )}
        {decided && !showSendToLower && loserInLower && (
          <div className="w-full flex items-center justify-center gap-1.5 border-t border-linha
                         bg-mata px-3 py-1.5 font-mono text-[11px] text-gelo/25">
            ✓ {loserName} no Lower
          </div>
        )}
      </div>
    </div>
  )
}

// One draggable/droppable slot inside a match card.
function DragSlot({ duplaId, name, win, dim, isDragActive, isOver, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }) {
  const hasDupla = duplaId != null
  const isEmpty = !hasDupla

  return (
    <div
      draggable={hasDupla}
      onDragStart={hasDupla ? onDragStart : undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={[
        'flex items-center gap-2 px-3 py-2.5 transition-colors',
        win ? 'bg-dourado/10' : '',
        dim ? 'opacity-45' : '',
        isOver ? 'bg-dourado/20 ring-1 ring-inset ring-dourado/60' : '',
        isDragActive && !isOver && isEmpty ? 'bg-mata/60' : '',
        hasDupla ? 'cursor-grab active:cursor-grabbing' : '',
        isDragActive && isEmpty ? 'border-dashed' : '',
      ].join(' ')}
    >
      {win && <Crown size={15} className="text-dourado shrink-0" />}
      {hasDupla && !win && isDragActive && (
        <GripVertical size={13} className="text-gelo/30 shrink-0" />
      )}
      <span
        className={[
          'font-medium truncate text-sm',
          win ? 'text-dourado' : isEmpty ? 'text-gelo/25 italic text-xs' : 'text-gelo',
        ].join(' ')}
      >
        {isEmpty ? 'vazio' : name}
      </span>
    </div>
  )
}

function ChampionBanner({ name, edition, onRanking, onReset }) {
  return (
    <div className="taca-pop rounded-xl border border-dourado bg-dourado/10 p-5 text-center taca-gold">
      <img src="/taca-logo.png" alt="" className="mx-auto h-20 w-auto drop-shadow-lg" />
      <Trophy size={32} className="mx-auto text-dourado mt-1" />
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
