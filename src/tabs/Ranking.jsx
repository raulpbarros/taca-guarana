// Ranking MVP — players by total cups hit. Per-tournament + all-time (persisted).
// See CLAUDE.md §4D.
import { useState } from 'react'
import { Crown, Trophy, Share2, Check } from 'lucide-react'
import { SectionHead } from './Setup.jsx'

export default function Ranking({ ctx }) {
  const { state, allTime } = ctx
  const [view, setView] = useState('torneio') // 'torneio' | 'geral'
  const [copied, setCopied] = useState(false)

  const duplaOf = (pid) => state.duplas.find((d) => d.playerIds.includes(pid))?.name || '—'

  const tournamentRows = Object.entries(state.stats.byPlayer)
    .map(([pid, hits]) => {
      const p = state.players.find((x) => x.id === pid)
      return p && !p.isWO ? { name: p.name, dupla: duplaOf(pid), hits } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.hits - a.hits)

  const allTimeRows = Object.entries(allTime)
    .map(([name, hits]) => ({ name, dupla: null, hits }))
    .sort((a, b) => b.hits - a.hits)

  const rows = view === 'torneio' ? tournamentRows : allTimeRows

  // Export/share the visible ranking as plain text. Native share sheet when
  // available (mobile/Edge), else copy to clipboard, else download a .txt.
  const shareRanking = async () => {
    const edition = state.tournamentName?.trim() || 'Taça Guaraná'
    const head =
      view === 'torneio'
        ? `🏆 Ranking MVP — ${edition}`
        : '🏆 Ranking MVP — Geral (todos os tempos)'
    const lines = rows.map((r, i) => `${i + 1}. ${r.name} — ${r.hits} copos`)
    const text = [head, ...lines].join('\n')

    try {
      if (navigator.share) {
        await navigator.share({ title: head, text })
        return
      }
    } catch {
      // user cancelled the share sheet — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return
    } catch {
      // clipboard blocked — last resort: download as file
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ranking-${edition}`.replace(/\s+/g, '-').toLowerCase() + '.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <SectionHead
        kicker="MVP"
        title="Ranking"
        sub="Soma de copos acertados por jogador. O geral acumula entre todos os torneios."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-linha bg-mata-2 p-1">
          <Tab active={view === 'torneio'} onClick={() => setView('torneio')}>
            Este torneio
          </Tab>
          <Tab active={view === 'geral'} onClick={() => setView('geral')}>
            Geral (todos)
          </Tab>
        </div>
        {rows.length > 0 && (
          <button
            onClick={shareRanking}
            className="ml-auto flex items-center gap-2 rounded-lg border border-linha bg-mata-2 px-4 py-2
                       font-bold text-sm text-gelo hover:border-gelo/40 active:scale-95 transition"
          >
            {copied ? (
              <>
                <Check size={16} className="text-dourado" /> Copiado!
              </>
            ) : (
              <>
                <Share2 size={16} /> Exportar
              </>
            )}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-linha bg-mata-2 p-8 text-center text-gelo/60">
          Ainda sem acertos registrados.{' '}
          {view === 'torneio' ? 'Jogue uma partida no Placar.' : 'Conclua um torneio.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-linha">
          <table className="w-full text-left">
            <thead className="bg-mata-2 font-mono text-[11px] tracking-widest text-gelo/50">
              <tr>
                <th className="px-3 py-3 w-12 text-center">#</th>
                <th className="px-3 py-3">JOGADOR</th>
                {view === 'torneio' && <th className="px-3 py-3 hidden sm:table-cell">DUPLA</th>}
                <th className="px-3 py-3 text-right">COPOS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const gold = i === 0
                return (
                  <tr
                    key={r.name + i}
                    className={[
                      'border-t border-linha',
                      gold ? 'bg-dourado/10' : i % 2 ? 'bg-mata-2/40' : '',
                    ].join(' ')}
                  >
                    <td className="px-3 py-3 text-center font-mono">
                      {gold ? (
                        <Crown size={18} className="mx-auto text-dourado" />
                      ) : (
                        <span className="text-gelo/50">{i + 1}</span>
                      )}
                    </td>
                    <td className={`px-3 py-3 font-bold ${gold ? 'text-dourado' : 'text-gelo'}`}>
                      {r.name}
                    </td>
                    {view === 'torneio' && (
                      <td className="px-3 py-3 hidden sm:table-cell text-gelo/60 truncate max-w-[14rem]">
                        {r.dupla}
                      </td>
                    )}
                    <td
                      className={`px-3 py-3 text-right font-mono font-bold text-lg ${
                        gold ? 'text-dourado' : 'text-gelo'
                      }`}
                    >
                      {r.hits}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'geral' && allTimeRows.length > 0 && (
        <p className="flex items-center gap-2 font-mono text-xs text-gelo/40">
          <Trophy size={13} className="text-dourado" /> Acumulado salvo permanentemente neste
          dispositivo.
        </p>
      )}
    </div>
  )
}

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-md px-4 py-2 font-bold text-sm transition',
        active ? 'bg-dourado text-mata' : 'text-gelo/60 hover:text-gelo',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
