// Histórico — past tournaments archived as JSON files on disk (File System
// Access API). Browse finished tournaments + all-time MVP aggregated from the
// files. See CLAUDE.md §4 and src/history.js.
import { useMemo, useRef, useState } from 'react'
import {
  FolderOpen,
  RefreshCw,
  Crown,
  Trophy,
  AlertTriangle,
  Archive,
  Upload,
  Download,
} from 'lucide-react'
import { SectionHead } from './Setup.jsx'

export default function History({ ctx }) {
  const { history } = ctx
  const {
    supported,
    status,
    dirName,
    records,
    pendingCount,
    connect,
    reconnect,
    refresh,
    importFiles,
    exportRecord,
    exportAll,
  } = history
  const [view, setView] = useState('torneios') // 'torneios' | 'mvp'

  // All-time MVP summed from every archived tournament, keyed by player name.
  const mvpRows = useMemo(() => {
    const map = {}
    for (const rec of records) {
      for (const r of rec.ranking || []) map[r.name] = (map[r.name] || 0) + r.hits
    }
    return Object.entries(map)
      .map(([name, hits]) => ({ name, hits }))
      .sort((a, b) => b.hits - a.hits)
  }, [records])

  return (
    <div className="space-y-6">
      <SectionHead
        kicker="ARQUIVO"
        title="Histórico"
        sub="Cada torneio concluído vira um arquivo na pasta escolhida. Sobrevive a limpeza do navegador."
      />

      <ConnectionBar
        supported={supported}
        status={status}
        dirName={dirName}
        count={records.length}
        pendingCount={pendingCount}
        onConnect={connect}
        onReconnect={reconnect}
        onRefresh={refresh}
      />

      <ImportExportBar
        recordCount={records.length}
        onImport={importFiles}
        onExportAll={exportAll}
      />

      {records.length > 0 && (
        <>
          <div className="inline-flex rounded-lg border border-linha bg-mata-2 p-1">
            <Tab active={view === 'torneios'} onClick={() => setView('torneios')}>
              Torneios ({records.length})
            </Tab>
            <Tab active={view === 'mvp'} onClick={() => setView('mvp')}>
              MVP de todos os tempos
            </Tab>
          </div>

          {view === 'torneios' ? (
            <TournamentList records={records} onExport={exportRecord} />
          ) : (
            <MvpTable rows={mvpRows} />
          )}
        </>
      )}
    </div>
  )
}

// Import (file upload) + export-all. Works on every browser — no folder needed.
function ImportExportBar({ recordCount, onImport, onExportAll }) {
  const inputRef = useRef(null)
  const [msg, setMsg] = useState(null)

  const handleFiles = async (e) => {
    const files = e.target.files
    if (!files?.length) return
    const { added, skipped } = await onImport(files)
    setMsg(
      added > 0
        ? `${added} torneio(s) importado(s)${skipped ? ` · ${skipped} ignorado(s)` : ''}.`
        : 'Nenhum torneio válido no arquivo.',
    )
    e.target.value = '' // allow re-importing the same file
    setTimeout(() => setMsg(null), 4000)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-linha bg-mata-2 p-4">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        multiple
        onChange={handleFiles}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-linha px-4 py-2 font-bold text-sm text-gelo hover:border-gelo/40 transition"
      >
        <Upload size={16} /> Importar arquivo
      </button>
      <button
        onClick={onExportAll}
        disabled={recordCount === 0}
        className="flex items-center gap-2 rounded-lg border border-linha px-4 py-2 font-bold text-sm text-gelo enabled:hover:border-gelo/40 transition disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Download size={16} /> Exportar tudo
      </button>
      {msg ? (
        <span className="font-mono text-xs text-dourado">{msg}</span>
      ) : (
        <span className="font-mono text-[11px] text-gelo/40">
          Traga torneios de outro aparelho (.json) ou faça backup completo.
        </span>
      )}
    </div>
  )
}

function ConnectionBar({
  supported,
  status,
  dirName,
  count,
  pendingCount,
  onConnect,
  onReconnect,
  onRefresh,
}) {
  if (!supported) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-copo/50 bg-copo/10 p-4 text-gelo">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-copo" />
        <div className="text-sm">
          <p className="font-bold">Navegador sem suporte a pastas locais.</p>
          <p className="text-gelo/70">
            Abra a Taça no <b>Microsoft Edge</b> ou <b>Google Chrome</b> para arquivar torneios em
            disco.
          </p>
        </div>
      </div>
    )
  }

  const pendingNote = pendingCount > 0 && (
    <p className="mt-2 flex items-center gap-2 font-mono text-xs text-dourado">
      <Archive size={13} /> {pendingCount} torneio(s) aguardando — serão gravados ao conectar a
      pasta.
    </p>
  )

  if (status === 'connected') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-linha bg-mata-2 p-4">
        <FolderOpen size={20} className="text-dourado" />
        <div className="min-w-0">
          <p className="font-bold text-gelo truncate">{dirName}</p>
          <p className="font-mono text-[11px] text-gelo/50">{count} torneio(s) arquivado(s)</p>
          {pendingNote}
        </div>
        <button
          onClick={onRefresh}
          className="ml-auto flex items-center gap-2 rounded-lg border border-linha px-4 py-2 font-bold text-sm text-gelo hover:border-gelo/40 transition"
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
    )
  }

  const needsPermission = status === 'needs-permission'
  return (
    <div className="rounded-xl border border-dashed border-linha bg-mata-2 p-6 text-center">
      <FolderOpen size={32} className="mx-auto text-dourado" />
      <p className="mt-3 font-bold text-gelo">
        {needsPermission ? 'Pasta lembrada — reconecte para liberar.' : 'Nenhuma pasta conectada.'}
      </p>
      <p className="mt-1 text-sm text-gelo/60">
        {needsPermission
          ? `Toque para reautorizar a pasta "${dirName}".`
          : 'Escolha uma pasta (ex.: Documentos/TacaGuarana) para guardar o histórico.'}
      </p>
      <button
        onClick={needsPermission ? onReconnect : onConnect}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-dourado px-6 py-3 font-display text-xl text-mata hover:brightness-105 active:scale-[0.99] transition"
      >
        <FolderOpen size={22} /> {needsPermission ? 'Reconectar pasta' : 'Conectar pasta'}
      </button>
      {pendingNote}
    </div>
  )
}

function TournamentList({ records, onExport }) {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-linha bg-mata-2 p-8 text-center text-gelo/60">
        Ainda sem torneios. Conclua um campeonato ou importe um arquivo.
      </div>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {records.map((rec) => (
        <TournamentCard key={rec.id} rec={rec} onExport={onExport} />
      ))}
    </div>
  )
}

function TournamentCard({ rec, onExport }) {
  const date = (rec.finishedAt || '').slice(0, 10)
  const top3 = (rec.ranking || []).slice(0, 3)
  return (
    <div className="rounded-xl border border-linha bg-mata-2 p-4">
      {rec.name && (
        <p className="font-display text-lg text-gelo leading-tight break-words mb-1">{rec.name}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-widest text-gelo/50">{date}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-gelo/40">{rec.size} duplas</span>
          <button
            onClick={() => onExport?.(rec)}
            aria-label="Exportar este torneio"
            title="Exportar (.json)"
            className="text-gelo/40 hover:text-gelo transition"
          >
            <Download size={15} />
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Crown size={20} className="shrink-0 text-dourado" />
        <span className="font-display text-2xl text-dourado leading-tight break-words">
          {rec.championName}
        </span>
      </div>
      {top3.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-linha pt-3">
          {top3.map((r, i) => (
            <li key={r.name + i} className="flex items-center justify-between text-sm text-gelo/80">
              <span className="truncate">
                <span className="font-mono text-gelo/40 mr-2">{i + 1}</span>
                {r.name}
              </span>
              <span className="font-mono font-bold">{r.hits}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MvpTable({ rows }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-linha bg-mata-2 p-8 text-center text-gelo/60">
        Sem dados ainda. Conclua torneios para acumular o MVP.
      </div>
    )
  }
  return (
    <>
      <div className="overflow-hidden rounded-xl border border-linha">
        <table className="w-full text-left">
          <thead className="bg-mata-2 font-mono text-[11px] tracking-widest text-gelo/50">
            <tr>
              <th className="px-3 py-3 w-12 text-center">#</th>
              <th className="px-3 py-3">JOGADOR</th>
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
      <p className="flex items-center gap-2 font-mono text-xs text-gelo/40">
        <Trophy size={13} className="text-dourado" /> Somado a partir dos arquivos no disco — fonte
        durável do histórico.
      </p>
    </>
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
