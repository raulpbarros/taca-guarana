import { useEffect, useState, lazy, Suspense } from 'react'
import { Settings, GitBranch, Target, Trophy, Archive, BarChart3, Minimize2 } from 'lucide-react'
import { useLocalStorage } from './hooks/useLocalStorage.js'
import { useHistory } from './history.js'
import { createInitialState } from './engine.js'
import Setup from './tabs/Setup.jsx'
import Bracket from './tabs/Bracket.jsx'
import Scoreboard from './tabs/Scoreboard.jsx'
import Ranking from './tabs/Ranking.jsx'
import History from './tabs/History.jsx'
// Painel pulls in recharts — load it on demand so the live Placar stays light.
const Painel = lazy(() => import('./tabs/Painel.jsx'))

const TABS = [
  { id: 'setup', label: 'Configuração', icon: Settings },
  { id: 'bracket', label: 'Chaveamento', icon: GitBranch },
  { id: 'scoreboard', label: 'Placar', icon: Target },
  { id: 'ranking', label: 'Ranking', icon: Trophy },
  { id: 'history', label: 'Histórico', icon: Archive },
  { id: 'painel', label: 'Painel', icon: BarChart3 },
]

export default function App() {
  const [activeTab, setActiveTab] = useLocalStorage('tacaGuarana:v1:activeTab', 'setup')
  const [state, setState] = useLocalStorage('tacaGuarana:v1:state', createInitialState())
  const [allTime, setAllTime] = useLocalStorage('tacaGuarana:allTimeMvp', {})
  const history = useHistory()

  // Kiosk = jumbotron focus mode: hide chrome, Placar fills the screen.
  const [kiosk, setKiosk] = useState(false)
  // Sound + haptic feedback on scoring/win. Persisted so the operator's choice sticks.
  const [sfxOn, setSfxOn] = useLocalStorage('tacaGuarana:v1:sfx', true)
  const matchInProgress = state.currentMatchId != null

  // Start a fresh tournament: keep the real roster, wipe bracket/placar/stats.
  // All-time MVP and on-disk history are untouched (separate storage).
  const resetTournament = () => {
    setKiosk(false)
    setState((s) => ({
      ...createInitialState(),
      players: s.players.filter((p) => !p.isWO),
    }))
    setActiveTab('setup')
  }

  const ctx = {
    state,
    setState,
    allTime,
    setAllTime,
    history,
    go: setActiveTab,
    kiosk,
    setKiosk,
    sfxOn,
    setSfxOn,
    resetTournament,
  }

  // Guard against accidental reload/close while a match is live (party big screen).
  useEffect(() => {
    if (!matchInProgress) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [matchInProgress])

  // Kiosk: render only the scoreboard, no header/nav/footer. Esc / button exits.
  if (kiosk) {
    return (
      <div className="min-h-full bg-mata">
        <button
          onClick={() => setKiosk(false)}
          aria-label="Sair do modo tela cheia"
          className="fixed top-3 right-3 z-40 flex items-center gap-2 rounded-lg border border-linha
                     bg-mata-2/80 px-3 py-2 font-mono text-xs text-gelo/60 backdrop-blur
                     hover:text-gelo hover:border-gelo/40 transition"
        >
          <Minimize2 size={16} /> SAIR (Esc)
        </button>
        <main className="mx-auto w-full max-w-7xl px-4 py-6">
          <Scoreboard ctx={ctx} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-full flex flex-col bg-mata">
      <header className="border-b border-linha bg-gradient-to-b from-guarana to-mata">
        <div className="mx-auto max-w-7xl px-4 pt-4 flex items-center gap-3">
          <img
            src="/taca-logo.png"
            alt="Taça Guaraná"
            className="h-14 sm:h-16 w-auto drop-shadow-lg drop-shadow-black/40"
          />
          <h1 className="sr-only">Taça Guaraná</h1>
          <p className="font-mono text-[11px] text-dourado truncate max-w-[55vw]">
            {state.tournamentName?.trim()
              ? state.tournamentName.trim().toUpperCase()
              : 'GERENCIADOR DE TORNEIO · BEER PONG'}
          </p>
        </div>

        <nav className="mx-auto max-w-7xl px-2 pt-4 grid grid-cols-6 gap-1 sm:gap-2">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            const pulse = id === 'scoreboard' && matchInProgress
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                aria-current={active ? 'page' : undefined}
                className={[
                  'relative flex items-center justify-center gap-2 rounded-t-lg px-2 py-3',
                  'font-sans font-bold text-sm sm:text-base transition-colors',
                  active
                    ? 'bg-mata text-gelo border-b-2 border-dourado'
                    : 'text-gelo/55 hover:text-gelo hover:bg-white/5',
                ].join(' ')}
              >
                <Icon className={pulse ? 'taca-pulse text-copo' : ''} size={20} />
                <span className="hidden sm:inline">{label}</span>
                {pulse && (
                  <span className="taca-pulse absolute right-2 top-2 h-2 w-2 rounded-full bg-copo" />
                )}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">
        {activeTab === 'setup' && <Setup ctx={ctx} />}
        {activeTab === 'bracket' && <Bracket ctx={ctx} />}
        {activeTab === 'scoreboard' && <Scoreboard ctx={ctx} />}
        {activeTab === 'ranking' && <Ranking ctx={ctx} />}
        {activeTab === 'history' && <History ctx={ctx} />}
        {activeTab === 'painel' && (
          <Suspense
            fallback={
              <p className="py-12 text-center font-mono text-sm text-gelo/40">Carregando painel…</p>
            }
          >
            <Painel ctx={ctx} />
          </Suspense>
        )}
      </main>

      <footer className="border-t border-linha py-3 text-center font-mono text-[11px] text-gelo/35">
        ESTADO SALVO LOCALMENTE · RESISTENTE A RECARGAS
      </footer>
    </div>
  )
}
