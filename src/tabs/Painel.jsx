// Painel — cross-edition metrics dashboard. Reads the archived tournament
// records (cross-browser mirror, see src/history.js) and aggregates them into
// stat cards + charts. Charts via recharts, themed with Arena Guaraná tokens.
import { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { Crown, Trophy, Users, Beer, Calendar, BarChart3 } from 'lucide-react'
import { SectionHead } from './Setup.jsx'

// Arena tokens as raw hex — recharts needs color strings, not Tailwind classes.
const C = {
  copo: '#C8232B',
  dourado: '#E8B23A',
  gelo: '#F4F6F4',
  linha: '#163d28',
  mata2: '#0a3a20',
  inativo: '#5A6B60',
}

export default function Painel({ ctx }) {
  const { records } = ctx.history

  const metrics = useMemo(() => buildMetrics(records), [records])

  if (records.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHead
          kicker="MÉTRICAS"
          title="Painel"
          sub="Estatísticas de todas as edições arquivadas."
        />
        <div className="rounded-xl border border-dashed border-linha bg-mata-2 p-10 text-center text-gelo/60">
          <BarChart3 size={36} className="mx-auto text-gelo/30" />
          <p className="mt-3 font-bold text-gelo">Sem dados ainda.</p>
          <p className="mt-1 text-sm">
            Conclua um torneio ou importe arquivos no Histórico para ver as métricas aqui.
          </p>
        </div>
      </div>
    )
  }

  const {
    totalEditions,
    totalCopos,
    uniquePlayers,
    avgCopos,
    topScorers,
    titles,
    perEdition,
    champions,
  } = metrics

  return (
    <div className="space-y-6">
      <SectionHead
        kicker="MÉTRICAS"
        title="Painel"
        sub="Estatísticas acumuladas de todas as edições arquivadas."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Calendar} label="Edições" value={totalEditions} />
        <StatCard icon={Beer} label="Copos acertados" value={totalCopos} />
        <StatCard icon={Users} label="Jogadores únicos" value={uniquePlayers} />
        <StatCard icon={Trophy} label="Copos / edição" value={avgCopos} gold />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Maiores artilheiros" sub="Total de copos acertados (todas as edições)">
          {topScorers.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, topScorers.length * 38)}>
              <BarChart
                data={topScorers}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                <CartesianGrid horizontal={false} stroke={C.linha} />
                <XAxis type="number" tick={axisTick} stroke={C.linha} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={96}
                  tick={axisTick}
                  stroke={C.linha}
                />
                <Tooltip {...tooltipProps} cursor={{ fill: '#ffffff10' }} />
                <Bar dataKey="hits" radius={[0, 4, 4, 0]} name="Copos">
                  {topScorers.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? C.dourado : C.copo} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Mais títulos" sub="Duplas campeãs por número de edições vencidas">
          {titles.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, titles.length * 38)}>
              <BarChart
                data={titles}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                <CartesianGrid horizontal={false} stroke={C.linha} />
                <XAxis type="number" tick={axisTick} stroke={C.linha} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={96}
                  tick={axisTick}
                  stroke={C.linha}
                />
                <Tooltip {...tooltipProps} cursor={{ fill: '#ffffff10' }} />
                <Bar dataKey="wins" radius={[0, 4, 4, 0]} fill={C.dourado} name="Títulos" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Copos por edição" sub="Total acertado em cada torneio">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={perEdition} margin={{ top: 4, right: 12, bottom: 4, left: -16 }}>
              <CartesianGrid vertical={false} stroke={C.linha} />
              <XAxis dataKey="label" tick={axisTick} stroke={C.linha} interval={0} />
              <YAxis tick={axisTick} stroke={C.linha} allowDecimals={false} />
              <Tooltip {...tooltipProps} cursor={{ fill: '#ffffff10' }} />
              <Bar dataKey="copos" radius={[4, 4, 0, 0]} fill={C.copo} name="Copos" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Participação" sub="Jogadores por edição ao longo do tempo">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={perEdition} margin={{ top: 4, right: 12, bottom: 4, left: -16 }}>
              <CartesianGrid vertical={false} stroke={C.linha} />
              <XAxis dataKey="label" tick={axisTick} stroke={C.linha} interval={0} />
              <YAxis tick={axisTick} stroke={C.linha} allowDecimals={false} />
              <Tooltip {...tooltipProps} />
              <Line
                type="monotone"
                dataKey="players"
                stroke={C.dourado}
                strokeWidth={2}
                dot={{ fill: C.dourado, r: 3 }}
                name="Jogadores"
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Galeria de campeões" sub="Vencedor de cada edição">
        <ul className="divide-y divide-linha">
          {champions.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <Crown size={18} className="shrink-0 text-dourado" />
              <span className="font-display text-xl text-dourado leading-tight truncate flex-1">
                {c.champion}
              </span>
              <span className="font-bold text-sm text-gelo/70 truncate hidden sm:block max-w-[40%]">
                {c.edition}
              </span>
              <span className="font-mono text-[11px] text-gelo/40 shrink-0">{c.date}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

// --------------------------------------------------------------------------
// Aggregation — pure, derived from the record list.
// --------------------------------------------------------------------------
function buildMetrics(records) {
  const scorerMap = {}
  const titleMap = {}
  let totalCopos = 0

  for (const rec of records) {
    for (const r of rec.ranking || []) {
      scorerMap[r.name] = (scorerMap[r.name] || 0) + r.hits
      totalCopos += r.hits
    }
    const champ = rec.championName
    if (champ && champ !== '—') titleMap[champ] = (titleMap[champ] || 0) + 1
  }

  const topScorers = Object.entries(scorerMap)
    .map(([name, hits]) => ({ name, hits }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 8)

  const titles = Object.entries(titleMap)
    .map(([name, wins]) => ({ name, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 8)

  // Chronological for the time-series charts (oldest → newest).
  const chrono = [...records].sort((a, b) =>
    (a.finishedAt || '').localeCompare(b.finishedAt || ''),
  )
  const perEdition = chrono.map((rec) => ({
    label: editionLabel(rec),
    copos: (rec.ranking || []).reduce((s, r) => s + r.hits, 0),
    players: (rec.players || []).filter((p) => !p.isWO).length || (rec.ranking || []).length,
  }))

  // Galeria — newest first (records already arrive sorted desc, but be safe).
  const champions = [...records]
    .sort((a, b) => (b.finishedAt || '').localeCompare(a.finishedAt || ''))
    .map((rec) => ({
      id: rec.id,
      champion: rec.championName || '—',
      edition: (rec.name || '').trim() || 'Edição sem nome',
      date: (rec.finishedAt || '').slice(0, 10),
    }))

  return {
    totalEditions: records.length,
    totalCopos,
    uniquePlayers: Object.keys(scorerMap).length,
    avgCopos: records.length ? Math.round(totalCopos / records.length) : 0,
    topScorers,
    titles,
    perEdition,
    champions,
  }
}

function editionLabel(rec) {
  const name = (rec.name || '').trim()
  if (name) return name.length > 12 ? name.slice(0, 11) + '…' : name
  return (rec.finishedAt || '').slice(5, 10) // MM-DD
}

// --------------------------------------------------------------------------
// Presentational bits.
// --------------------------------------------------------------------------
const axisTick = { fill: '#F4F6F480', fontSize: 11, fontFamily: 'Space Mono, monospace' }

const tooltipProps = {
  contentStyle: {
    background: C.mata2,
    border: `1px solid ${C.linha}`,
    borderRadius: 8,
    fontFamily: 'Space Mono, monospace',
    fontSize: 12,
  },
  labelStyle: { color: C.gelo },
  itemStyle: { color: C.gelo },
}

function StatCard({ icon: Icon, label, value, gold }) {
  return (
    <div className="rounded-xl border border-linha bg-mata-2 p-4">
      <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-gelo/50">
        <Icon size={14} className={gold ? 'text-dourado' : 'text-copo'} />
        {label.toUpperCase()}
      </div>
      <div
        className={`mt-2 font-mono font-bold text-4xl ${gold ? 'text-dourado' : 'text-gelo'}`}
      >
        {value}
      </div>
    </div>
  )
}

function Panel({ title, sub, children }) {
  return (
    <div className="rounded-xl border border-linha bg-mata-2 p-4">
      <h3 className="font-display text-2xl text-gelo leading-tight">{title}</h3>
      {sub && <p className="font-mono text-[11px] text-gelo/40 mb-3">{sub}</p>}
      {children}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-44 items-center justify-center text-sm text-gelo/40">
      Dados insuficientes.
    </div>
  )
}
