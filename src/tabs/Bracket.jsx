// Chaveamento — single-elimination bracket (4/8/16). Ready match shows "INICIAR
// JOGO", future matches locked, winners highlighted. See CLAUDE.md §4B.
import { useEffect, useRef } from 'react'
import { Play, Lock, Crown, RotateCcw } from 'lucide-react'
import { SectionHead } from './Setup.jsx'
import { CUPS_PER_TEAM, roundLabel, nextPlayableMatch } from '../engine.js'

export default function Bracket({ ctx }) {
  const { state, setState, go, resetTournament } = ctx
  const { bracket, champion } = state
  const edition = state.tournamentName?.trim()
  const nextRef = useRef(null)

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
  // The single match the operator should play next (used to highlight + scroll).
  const nextId = nextPlayableMatch(bracket, byId)?.id ?? null

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
        <button
          onClick={onReset}
          className="mt-1 shrink-0 flex items-center gap-1.5 rounded-lg border border-linha bg-mata-2
                     px-3 py-2 font-mono text-xs text-gelo/50 hover:text-copo hover:border-copo/50 transition"
        >
          <RotateCcw size={14} /> Reiniciar
        </button>
      </div>

      {champion && (
        <ChampionBanner
          name={nameOf(champion)}
          edition={edition}
          onRanking={() => go('ranking')}
          onReset={onReset}
        />
      )}

      <div className="flex gap-5 overflow-x-auto pb-4">
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
      </div>
    </div>
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
