// Taça Guaraná — tournament archive on disk via the File System Access API.
// Each finished tournament is written as one JSON file into an operator-picked
// folder (e.g. Documents/TacaGuarana). The directory handle is remembered in
// IndexedDB so the same folder reconnects on later sessions (one user click to
// re-grant permission). If no folder is connected when a tournament ends, the
// snapshot is buffered in localStorage and flushed to disk on next connect.
//
// Chromium only (Edge/Chrome). See CLAUDE.md §5 for the live-state model.
import { useCallback, useEffect, useRef, useState } from 'react'
import { uid } from './engine.js'

// ---------------------------------------------------------------------------
// IndexedDB — persists the FileSystemDirectoryHandle across sessions.
// ---------------------------------------------------------------------------
const DB_NAME = 'tacaGuarana'
const STORE = 'handles'
const HANDLE_KEY = 'historyDir'
const PENDING_KEY = 'tacaGuarana:v1:pendingHistory'
// Browser-agnostic mirror of every known record (disk + imported + saved).
// Disk is the durable source on Chromium; this mirror keeps the History list
// and the Painel dashboard working on any browser, with or without a folder.
const RECORDS_KEY = 'tacaGuarana:v1:records'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function idbSet(key, val) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(val, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ---------------------------------------------------------------------------
// File System Access helpers.
// ---------------------------------------------------------------------------
export function historySupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

async function verifyPermission(handle, write) {
  const opts = { mode: write ? 'readwrite' : 'read' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  // requestPermission needs a user gesture — call only from click handlers.
  if ((await handle.requestPermission(opts)) === 'granted') return true
  return false
}

async function writeRecord(dir, record) {
  const day = (record.finishedAt || new Date().toISOString()).slice(0, 10)
  const fname = `taca-${day}-${record.id}.json`
  const fh = await dir.getFileHandle(fname, { create: true })
  const w = await fh.createWritable()
  await w.write(JSON.stringify(record, null, 2))
  await w.close()
  return fname
}

async function readAll(dir) {
  const out = []
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file') continue
    if (!entry.name.startsWith('taca-') || !entry.name.endsWith('.json')) continue
    try {
      const file = await entry.getFile()
      const rec = JSON.parse(await file.text())
      rec._file = entry.name
      out.push(rec)
    } catch {
      // skip unreadable / non-JSON file
    }
  }
  out.sort((a, b) => (b.finishedAt || '').localeCompare(a.finishedAt || ''))
  return out
}

// ---------------------------------------------------------------------------
// localStorage pending buffer (snapshots saved while no folder connected).
// ---------------------------------------------------------------------------
function readPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY)) || []
  } catch {
    return []
  }
}

function writePending(arr) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(arr))
  } catch {
    // storage full — keep in memory only
  }
}

// ---------------------------------------------------------------------------
// localStorage records mirror — cross-browser cache of every record.
// ---------------------------------------------------------------------------
function readMirror() {
  try {
    return JSON.parse(localStorage.getItem(RECORDS_KEY)) || []
  } catch {
    return []
  }
}

function writeMirror(arr) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(arr))
  } catch {
    // storage full — mirror stays in memory only
  }
}

// Merge incoming records into a base list, deduped by id (incoming wins),
// newest finishedAt first. Drops the transient _file field from the cache.
function mergeRecords(base, incoming) {
  const byId = {}
  for (const r of base) byId[r.id] = r
  for (const r of incoming) {
    const { _file, ...clean } = r
    byId[clean.id] = clean
  }
  return Object.values(byId).sort((a, b) =>
    (b.finishedAt || '').localeCompare(a.finishedAt || ''),
  )
}

// Validate + normalize a parsed JSON blob into a record. Returns null if it
// doesn't look like a Taça tournament. Assigns an id when one is missing.
function normalizeRecord(obj) {
  if (!obj || typeof obj !== 'object') return null
  const looksLikeRecord = Array.isArray(obj.ranking) || typeof obj.championName === 'string'
  if (!looksLikeRecord) return null
  return {
    ...obj,
    id: typeof obj.id === 'string' && obj.id ? obj.id : uid('t'),
    finishedAt: obj.finishedAt || new Date().toISOString(),
    ranking: Array.isArray(obj.ranking) ? obj.ranking : [],
  }
}

// Download any JSON payload as a file (cross-browser, no folder needed).
function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Pure: build the durable snapshot of a finished tournament.
// ---------------------------------------------------------------------------
export function buildTournamentRecord(state, bracket, championId) {
  const champ = state.duplas.find((d) => d.id === championId)
  const duplaOf = (pid) =>
    state.duplas.find((d) => d.playerIds.includes(pid))?.name || '—'

  const ranking = Object.entries(state.stats.byPlayer)
    .map(([pid, hits]) => {
      const p = state.players.find((x) => x.id === pid)
      return p && !p.isWO ? { name: p.name, dupla: duplaOf(pid), hits } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.hits - a.hits)

  return {
    id: uid('t'),
    name: (state.tournamentName || '').trim() || null,
    finishedAt: new Date().toISOString(),
    size: bracket?.size ?? null,
    championName: champ?.name || '—',
    championDuplaId: championId,
    players: state.players.map((p) => ({ id: p.id, name: p.name, isWO: !!p.isWO })),
    duplas: state.duplas.map((d) => ({ id: d.id, name: d.name, playerIds: d.playerIds })),
    bracket,
    ranking,
    statsByPlayer: state.stats.byPlayer,
  }
}

// ---------------------------------------------------------------------------
// React hook — folder connection state + records + save/flush.
// status: 'unsupported' | 'disconnected' | 'needs-permission' | 'connected'
// ---------------------------------------------------------------------------
export function useHistory() {
  const supported = historySupported()
  const [status, setStatus] = useState(supported ? 'disconnected' : 'unsupported')
  const [dirName, setDirName] = useState(null)
  // Seed from the cross-browser mirror so the list/dashboard show instantly,
  // even before (or without) a disk folder connection.
  const [records, setRecords] = useState(() => readMirror())
  const [pendingCount, setPendingCount] = useState(() => readPending().length)
  const dirRef = useRef(null)

  // Persist + publish a merged record set in one place.
  const commitRecords = useCallback((incoming) => {
    const merged = mergeRecords(readMirror(), incoming)
    writeMirror(merged)
    setRecords(merged)
    return merged
  }, [])

  const flushPending = useCallback(async (dir) => {
    const pend = readPending()
    if (!pend.length) return
    const remaining = []
    for (const rec of pend) {
      try {
        await writeRecord(dir, rec)
      } catch {
        remaining.push(rec)
      }
    }
    writePending(remaining)
    setPendingCount(remaining.length)
  }, [])

  const loadFrom = useCallback(
    async (dir) => {
      dirRef.current = dir
      setDirName(dir.name)
      await flushPending(dir)
      // Merge disk into the mirror so imported/other-browser records survive.
      commitRecords(await readAll(dir))
      setStatus('connected')
    },
    [flushPending, commitRecords],
  )

  // Silent restore on mount: reattach the remembered folder if permission
  // is still granted; otherwise surface a one-click reconnect.
  useEffect(() => {
    if (!supported) return
    let cancelled = false
    ;(async () => {
      try {
        const handle = await idbGet(HANDLE_KEY)
        if (!handle || cancelled) return
        dirRef.current = handle
        setDirName(handle.name)
        if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
          if (!cancelled) await loadFrom(handle)
        } else if (!cancelled) {
          setStatus('needs-permission')
        }
      } catch {
        // no remembered folder / IndexedDB unavailable
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supported, loadFrom])

  // Pick a new folder (user gesture).
  const connect = useCallback(async () => {
    if (!supported) return
    try {
      const handle = await window.showDirectoryPicker({ id: 'tacaGuaranaHistory', mode: 'readwrite' })
      if (!(await verifyPermission(handle, true))) return
      await idbSet(HANDLE_KEY, handle)
      await loadFrom(handle)
    } catch {
      // user dismissed the picker
    }
  }, [supported, loadFrom])

  // Re-grant permission on the remembered folder (user gesture).
  const reconnect = useCallback(async () => {
    const handle = dirRef.current || (await idbGet(HANDLE_KEY))
    if (!handle) return connect()
    if (!(await verifyPermission(handle, true))) return
    await idbSet(HANDLE_KEY, handle)
    await loadFrom(handle)
  }, [connect, loadFrom])

  const refresh = useCallback(async () => {
    if (dirRef.current) commitRecords(await readAll(dirRef.current))
  }, [commitRecords])

  // Persist a finished tournament. Called from a click handler (victory
  // confirm), so requesting permission is allowed. Falls back to buffering.
  const saveTournament = useCallback(
    async (record) => {
      // Always mirror to localStorage first — the record is never lost even if
      // no folder is connected or the browser lacks File System Access.
      commitRecords([record])
      const dir = dirRef.current
      if (dir) {
        try {
          if (await verifyPermission(dir, true)) {
            await writeRecord(dir, record)
            await loadFrom(dir)
            return { saved: true }
          }
        } catch {
          // fall through to buffer
        }
      }
      const pend = [...readPending(), record]
      writePending(pend)
      setPendingCount(pend.length)
      return { saved: false }
    },
    [loadFrom, commitRecords],
  )

  // Import one or more JSON files (FileList or array). Records merge into the
  // mirror and, when a folder is connected, are also written to disk. Returns
  // counts so the UI can report what landed. Works on every browser.
  const importFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || [])
      let added = 0
      let skipped = 0
      const valid = []
      for (const file of files) {
        try {
          const parsed = JSON.parse(await file.text())
          // A file may hold a single record or a backup array of records.
          const blobs = Array.isArray(parsed) ? parsed : [parsed]
          for (const blob of blobs) {
            const rec = normalizeRecord(blob)
            if (rec) {
              valid.push(rec)
              added += 1
            } else {
              skipped += 1
            }
          }
        } catch {
          skipped += 1
        }
      }
      if (valid.length) {
        commitRecords(valid)
        const dir = dirRef.current
        if (dir) {
          try {
            if (await verifyPermission(dir, true)) {
              for (const rec of valid) await writeRecord(dir, rec)
            }
          } catch {
            // disk write failed — mirror still holds them
          }
        }
      }
      return { added, skipped }
    },
    [commitRecords],
  )

  // Export a single record or the whole archive as a downloaded JSON file.
  const exportRecord = useCallback((rec) => {
    const day = (rec.finishedAt || '').slice(0, 10)
    downloadJson(`taca-${day}-${rec.id}.json`, rec)
  }, [])

  const exportAll = useCallback(() => {
    const day = new Date().toISOString().slice(0, 10)
    downloadJson(`taca-guarana-backup-${day}.json`, readMirror())
  }, [])

  return {
    supported,
    status,
    dirName,
    records,
    pendingCount,
    connect,
    reconnect,
    refresh,
    saveTournament,
    importFiles,
    exportRecord,
    exportAll,
  }
}
