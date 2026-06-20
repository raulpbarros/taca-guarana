// Chaveamento — single-elimination bracket (4/8/16). Ready match shows "INICIAR
// JOGO", future matches locked, winners highlighted. The "Editar" panel is always
// available and lets the operator rebuild EVERY phase by hand — pick the duplas of
// any confronto and move confrontos between phases. Saving turns the bracket manual
// (winners stop auto-advancing; the operator owns each phase). See CLAUDE.md §4B.
import { useEffect, useRef, useState } from 'react'
import { Play, Lock, Crown, RotateCcw, Pencil, Check, X, ArrowLeftRight } from 'lucide-react'
import { SectionHead } from './Setup.jsx'
import {
  CUPS_PER_TEAM,
  uid,
  roundLabel,
  nextPlayableMatch,
  applyManualEdit,
} from '../engine.js'

// Slot sentinels for the editor. A real slot holds a dupla id; '' is an empty vaga
// (Vazio) and WO_SENTINEL a free W.O. bye the operator can drop anywhere.
const WO_SENTINEL = '__wo__'
const EMPTY = ''

export default function Bracket({ ctx }) {
  const { state, setState, go, resetTournament } = ctx
  const { bracket, champion } = state
  const edition = state.tournamentName?.trim()
  const nextRef = useRef(null)
  // Edit mode working copy. null = not editing. Shape:
  //   { matches: [{ id, phase, a, b, winnerId }], third: { id, a, b, winnerId } | null }
  // a/b are a dupla id | WO_SENTINEL | EMPTY. `phase` = round index the match sits in.
  const [draft, setDraft] = useState(null)
  const editing = draft != null

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

  // Padding W.O. duplas (byes) aren't kept in state.duplas — they only live inside the
  // bracket as ids. Synthesize them here so isWO / naming work everywhere, including after
  // a manual edit (otherwise a bye would render as a real opponent named "W.O.").
  const realById = Object.fromEntries(state.duplas.map((d) => [d.id, d]))
  const byId = { ...realById }
  const addWO = (id) => {
    if (id != null && !byId[id]) byId[id] = { id, name: 'W.O.', isWO: true }
  }
  bracket.rounds.forEach((r) => r.forEach((m) => (addWO(m.dupAId), addWO(m.dupBId))))
  if (bracket.thirdPlace) {
    addWO(bracket.thirdPlace.dupAId)
    addWO(bracket.thirdPlace.dupBId)
  }
  const nameOf = (id) => byId[id]?.name || '—'
  const isWO = (id) => id == null || byId[id]?.isWO
  // The single match the operator should play next (used to highlight + scroll).
  const nextId = nextPlayableMatch(bracket, byId)?.id ?? null

  const realDuplas = state.duplas
  const phaseLabels = bracket.rounds.map((_, i) => roundLabel(bracket, i))
  const phaseCount = bracket.rounds.length

  // Map a stored dupla id to its editor slot value (real id / WO_SENTINEL / EMPTY).
  const slotVal = (id) => (id == null ? EMPTY : realById[id] ? id : WO_SENTINEL)

  const startEdit = () => {
    const matches = []
    bracket.rounds.forEach((round, ri) =>
      round.forEach((m) =>
        matches.push({
          id: m.id,
          phase: ri,
          a: slotVal(m.dupAId),
          b: slotVal(m.dupBId),
          winnerId: m.winnerId,
        }),
      ),
    )
    const tp = bracket.thirdPlace
    const third = tp
      ? { id: tp.id, a: slotVal(tp.dupAId), b: slotVal(tp.dupBId), winnerId: tp.winnerId }
      : null
    setDraft({ matches, third })
  }
  const cancelEdit = () => setDraft(null)

  const setSlot = (id, side, val) =>
    setDraft((d) => ({
      ...d,
      matches: d.matches.map((m) => (m.id === id ? { ...m, [side]: val } : m)),
    }))
  const setPhase = (id, phase) =>
    setDraft((d) => ({
      ...d,
      matches: d.matches.map((m) => (m.id === id ? { ...m, phase } : m)),
    }))
  const setThirdSlot = (side, val) =>
    setDraft((d) => ({ ...d, third: { ...d.third, [side]: val } }))

  // ---- Validation over the working draft -------------------------------------------
  // A real dupla may sit in different phases (it won and advanced), but not twice in the
  // SAME phase, and never against itself. Empty / W.O. slots are unlimited.
  const conflicts = new Set() // `${matchId}:${side}` — dupla repeated within its phase
  const selfMatches = new Set() // matchId — same dupla on both sides
  let unplaced = []
  if (draft) {
    for (let pi = 0; pi < phaseCount; pi++) {
      const slots = []
      draft.matches
        .filter((m) => m.phase === pi)
        .forEach((m) => {
          slots.push([m.id, 'a', m.a])
          slots.push([m.id, 'b', m.b])
        })
      const cnt = {}
      slots.forEach(([, , v]) => {
        if (v && v !== WO_SENTINEL) cnt[v] = (cnt[v] || 0) + 1
      })
      slots.forEach(([id, side, v]) => {
        if (v && v !== WO_SENTINEL && cnt[v] > 1) conflicts.add(`${id}:${side}`)
      })
    }
    const isSelf = (a, b) => a && b && a !== WO_SENTINEL && a === b
    draft.matches.forEach((m) => isSelf(m.a, m.b) && selfMatches.add(m.id))
    if (draft.third && isSelf(draft.third.a, draft.third.b)) selfMatches.add(draft.third.id)

    const placed = new Set()
    const note = (v) => v && v !== WO_SENTINEL && placed.add(v)
    draft.matches.forEach((m) => (note(m.a), note(m.b)))
    if (draft.third) (note(draft.third.a), note(draft.third.b))
    unplaced = realDuplas.filter((d) => !placed.has(d.id))
  }
  const seedValid = draft && conflicts.size === 0 && selfMatches.size === 0

  const saveEdit = () => {
    if (!seedValid) return
    // Reuse the bracket's existing W.O. ids for emptied byes; mint fresh ones only if short.
    const woPool = []
    const harvestWO = (id) => {
      if (id != null && !realById[id]) woPool.push(id)
    }
    bracket.rounds.forEach((r) => r.forEach((m) => (harvestWO(m.dupAId), harvestWO(m.dupBId))))
    if (bracket.thirdPlace) {
      harvestWO(bracket.thirdPlace.dupAId)
      harvestWO(bracket.thirdPlace.dupBId)
    }
    const toId = (v) =>
      v === EMPTY || v == null ? null : v !== WO_SENTINEL ? v : woPool.shift() || uid('wo')

    const draftRounds = Array.from({ length: phaseCount }, () => [])
    draft.matches.forEach((m) => {
      draftRounds[m.phase].push({
        id: m.id,
        dupAId: toId(m.a),
        dupBId: toId(m.b),
        winnerId: m.winnerId,
      })
    })
    const draftThird = draft.third
      ? {
          dupAId: toId(draft.third.a),
          dupBId: toId(draft.third.b),
          winnerId: draft.third.winnerId,
        }
      : null

    const liveEdited = state.currentMatchId != null
    if (
      !window.confirm(
        'Salvar deixa o chaveamento manual: os vencedores não avançam mais sozinhos — você monta ' +
          'cada fase. ' +
          (liveEdited ? 'A partida atual no placar será encerrada. ' : '') +
          'Resultados de confrontos cujas duplas mudaram serão limpos. O ranking histórico é ' +
          'mantido. Continuar?',
      )
    )
      return

    const { bracket: newBracket, champion: newChampion } = applyManualEdit(
      bracket,
      draftRounds,
      draftThird,
    )
    setState((s) => ({
      ...s,
      bracket: newBracket,
      champion: newChampion,
      currentMatchId: null,
      cups: { left: CUPS_PER_TEAM, right: CUPS_PER_TEAM },
      undoStack: [],
    }))
    setDraft(null)
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
          sub={
            bracket.manual
              ? `Chaveamento manual de ${bracket.size} duplas. Você controla cada fase — edite à vontade.`
              : `Mata-mata de ${bracket.size} duplas. Toque em INICIAR JOGO na partida liberada.`
          }
        />
        <div className="mt-1 shrink-0 flex items-center gap-2">
          {!editing && (
            <button
              onClick={startEdit}
              title="Edite os confrontos e mova-os entre as fases. Ao salvar, o chaveamento vira manual."
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
          draft={draft}
          realDuplas={realDuplas}
          phaseLabels={phaseLabels}
          conflicts={conflicts}
          selfMatches={selfMatches}
          unplaced={unplaced}
          valid={seedValid}
          setSlot={setSlot}
          setPhase={setPhase}
          setThirdSlot={setThirdSlot}
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

// Full bracket editor. Every phase is shown; each match exposes a phase selector (move
// it between fases) and two slot <select>s over the dupla pool (plus free W.O. / Vazio).
// The 3rd-place dispute is editable too. Validation flags same-phase duplicates and
// self-matches and blocks save until clean.
function EditPanel({
  draft,
  realDuplas,
  phaseLabels,
  conflicts,
  selfMatches,
  unplaced,
  valid,
  setSlot,
  setPhase,
  setThirdSlot,
  onSave,
  onCancel,
}) {
  return (
    <div className="rounded-xl border border-dourado/60 bg-mata-2 p-4 space-y-5">
      <div className="flex items-center gap-2 font-display text-lg text-dourado">
        <ArrowLeftRight size={18} /> Editar chaveamento — todas as fases
      </div>
      <p className="font-mono text-xs text-gelo/50">
        Monte qualquer confronto em qualquer fase e mova confrontos entre fases pelo seletor
        FASE. Ao salvar, o chaveamento passa a ser manual: os vencedores não avançam sozinhos —
        você define cada fase.
      </p>
      {(conflicts.size > 0 || selfMatches.size > 0) && (
        <div className="rounded-lg border border-copo/60 bg-copo/10 px-3 py-2 font-mono text-xs text-copo space-y-1">
          {conflicts.size > 0 && <div>Há dupla repetida na mesma fase.</div>}
          {selfMatches.size > 0 && <div>Há confronto com a mesma dupla nos dois lados.</div>}
        </div>
      )}
      {unplaced.length > 0 && (
        <div className="rounded-lg border border-linha bg-mata px-3 py-2 font-mono text-xs text-gelo/50">
          Fora do chaveamento: {unplaced.map((d) => d.name).join(', ')}.
        </div>
      )}

      {phaseLabels.map((label, pi) => {
        const ms = draft.matches.filter((m) => m.phase === pi)
        return (
          <div key={pi} className="space-y-2">
            <h4 className="font-display text-base text-gelo/80">{label}</h4>
            {ms.length === 0 ? (
              <p className="font-mono text-[11px] text-gelo/30">Sem confrontos nesta fase.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {ms.map((m) => (
                  <MatchEditor
                    key={m.id}
                    m={m}
                    realDuplas={realDuplas}
                    phaseLabels={phaseLabels}
                    selfMatch={selfMatches.has(m.id)}
                    conflictA={conflicts.has(`${m.id}:a`)}
                    conflictB={conflicts.has(`${m.id}:b`)}
                    onPhase={(p) => setPhase(m.id, p)}
                    onA={(v) => setSlot(m.id, 'a', v)}
                    onB={(v) => setSlot(m.id, 'b', v)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {draft.third && (
        <div className="space-y-2">
          <h4 className="font-display text-base text-gelo/80">3º Lugar</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className={[
                'rounded-lg border bg-mata p-3 space-y-2',
                selfMatches.has(draft.third.id) ? 'border-copo' : 'border-linha',
              ].join(' ')}
            >
              <div className="font-mono text-[10px] tracking-widest text-gelo/40">DISPUTA DE 3º</div>
              <SlotSelect
                value={draft.third.a}
                realDuplas={realDuplas}
                conflict={selfMatches.has(draft.third.id)}
                onChange={(v) => setThirdSlot('a', v)}
              />
              <div className="text-center font-display text-xs text-copo">VS</div>
              <SlotSelect
                value={draft.third.b}
                realDuplas={realDuplas}
                conflict={selfMatches.has(draft.third.id)}
                onChange={(v) => setThirdSlot('b', v)}
              />
            </div>
          </div>
        </div>
      )}

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
          disabled={!valid}
          className={[
            'flex items-center gap-1.5 rounded-lg px-4 py-2 font-bold transition',
            valid
              ? 'bg-dourado text-mata hover:brightness-105'
              : 'bg-dourado/30 text-mata/50 cursor-not-allowed',
          ].join(' ')}
        >
          <Check size={16} /> Salvar chaveamento
        </button>
      </div>
    </div>
  )
}

// One editable confronto: a FASE selector (move between phases) + the two slot selects.
function MatchEditor({ m, realDuplas, phaseLabels, selfMatch, conflictA, conflictB, onPhase, onA, onB }) {
  return (
    <div
      className={[
        'rounded-lg border bg-mata p-3 space-y-2',
        selfMatch ? 'border-copo' : 'border-linha',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-widest text-gelo/40">CONFRONTO</span>
        <label className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-gelo/40">
          FASE
          <select
            value={m.phase}
            onChange={(e) => onPhase(Number(e.target.value))}
            className="rounded border border-linha bg-mata-2 px-1.5 py-1 font-sans text-xs text-gelo
                       focus:outline-none focus:border-dourado"
          >
            {phaseLabels.map((lab, i) => (
              <option key={i} value={i}>
                {lab}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SlotSelect value={m.a} realDuplas={realDuplas} conflict={conflictA || selfMatch} onChange={onA} />
      <div className="text-center font-display text-xs text-copo">VS</div>
      <SlotSelect value={m.b} realDuplas={realDuplas} conflict={conflictB || selfMatch} onChange={onB} />
    </div>
  )
}

function SlotSelect({ value, realDuplas, conflict, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[
        'w-full rounded-lg border bg-mata-2 px-3 py-2 font-medium text-gelo focus:outline-none',
        conflict ? 'border-copo focus:border-copo' : 'border-linha focus:border-dourado',
      ].join(' ')}
    >
      <option value={EMPTY}>— Vazio —</option>
      {realDuplas.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
      <option value={WO_SENTINEL}>W.O. (vaga livre)</option>
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
