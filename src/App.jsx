import { useState, useEffect } from "react"
import TaskTable, { overdueTasks, upcomingTasks, mockClientStats } from "./components/TimelineTable"
import { fetchAllSheetsData, categorizeTasks, parseSheetId } from "./lib/sheetsApi"
import magicLogo from "./assets/magic-logo.svg"

// ─── URL hash helpers (cross-browser persistence) ─────────────────────────────
// Format: http://localhost:5173/#s=spreadsheetId1,spreadsheetId2,...
// Spreadsheet IDs are compact & URL-safe; full sheet URLs are reconstructed.

function sheetsFromHash() {
  try {
    const hash = window.location.hash
    if (!hash.startsWith("#s=")) return []
    const ids = hash.slice(3).split(",").filter(Boolean)
    return ids.map((sid, i) => ({
      id: Date.now() + i,
      url: `https://docs.google.com/spreadsheets/d/${sid}`,
    }))
  } catch { return [] }
}

function syncHash(sheets) {
  const ids = sheets.map((s) => parseSheetId(s.url)).filter(Boolean).join(",")
  window.history.replaceState(
    null, "",
    ids ? `${window.location.pathname}${window.location.search}#s=${ids}` : window.location.pathname
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconSync({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}
function IconCheck({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function IconTrash({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}
function IconWarning({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

const SYNC_COOLDOWN_MS = 3 * 60 * 1000 // 3 minutes between auto-syncs

export default function App() {
  // Priority: URL hash (cross-browser) → localStorage (same browser) → empty
  const [sheets, setSheets] = useState(() => {
    const fromHash = sheetsFromHash()
    if (fromHash.length > 0) return fromHash
    try { return JSON.parse(localStorage.getItem("magic-sheets") || "[]") }
    catch { return [] }
  })
  const [inputUrl, setInputUrl]     = useState("")
  const [isSyncing, setIsSyncing]   = useState(false)
  // Restore cached live data so the page shows real data immediately on reload
  const [liveTasks, setLiveTasks]   = useState(() => {
    try { return JSON.parse(localStorage.getItem("magic-live-tasks") || "null") }
    catch { return null }
  })
  const [syncError, setSyncError]   = useState(null)
  const [lastSynced, setLastSynced] = useState(() => {
    const ts = localStorage.getItem("magic-last-synced")
    return ts ? new Date(ts) : null
  })
  const [copied, setCopied]         = useState(false)

  // Remarks — persisted to localStorage, keyed by "ClientName::Topic"
  const [remarks, setRemarks] = useState(() => {
    try { return JSON.parse(localStorage.getItem("magic-remarks") || "{}") }
    catch { return {} }
  })
  useEffect(() => {
    localStorage.setItem("magic-remarks", JSON.stringify(remarks))
  }, [remarks])
  const updateRemark = (key, value) => {
    setRemarks((prev) => {
      const next = { ...prev }
      if (value) next[key] = value
      else delete next[key]
      return next
    })
  }

  // Persist live tasks cache + last synced timestamp
  useEffect(() => {
    if (liveTasks) localStorage.setItem("magic-live-tasks", JSON.stringify(liveTasks))
  }, [liveTasks])
  useEffect(() => {
    if (lastSynced) localStorage.setItem("magic-last-synced", lastSynced.toISOString())
  }, [lastSynced])

  // Keep localStorage + URL hash in sync whenever sheets change
  useEffect(() => {
    localStorage.setItem("magic-sheets", JSON.stringify(sheets))
    syncHash(sheets)
  }, [sheets])

  // Auto-sync on page load — skip if synced within the last 3 minutes (quota guard)
  useEffect(() => {
    if (sheets.length === 0) return
    if (lastSynced && (Date.now() - lastSynced.getTime()) < SYNC_COOLDOWN_MS) return
    syncData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const displayOverdue     = liveTasks ? liveTasks.overdue     : overdueTasks
  const displayUpcoming    = liveTasks ? liveTasks.upcoming    : upcomingTasks
  const displayClientStats = liveTasks ? liveTasks.clientStats : mockClientStats

  const addSheet = () => {
    const trimmed = inputUrl.trim()
    if (!trimmed) return
    setSheets((prev) => [...prev, { id: Date.now(), url: trimmed }])
    setInputUrl("")
  }

  const removeSheet = (id) => {
    setSheets((prev) => {
      const next = prev.filter((s) => s.id !== id)
      if (next.length === 0) { setLiveTasks(null); setSyncError(null) }
      return next
    })
  }

  const syncData = async () => {
    if (isSyncing || sheets.length === 0) return
    setIsSyncing(true)
    setSyncError(null)
    try {
      const allTasks = await fetchAllSheetsData(sheets)
      const { overdue, upcoming, clientStats } = categorizeTasks(allTasks)
      setLiveTasks({ overdue, upcoming, clientStats })
      setLastSynced(new Date())
    } catch (err) {
      const msg = err.message || ""
      setSyncError(
        msg.includes("429") || msg.toLowerCase().includes("quota")
          ? "API quota เต็มชั่วคราว — Google Sheets อนุญาตสูงสุด 60 requests/นาที กรุณารอ 1-2 นาทีแล้ว Sync ใหม่"
          : msg
      )
    } finally {
      setIsSyncing(false)
    }
  }

  const handleKeyDown = (e) => { if (e.key === "Enter") addSheet() }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50/60">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-purple-100 bg-white/95 px-8 py-3 backdrop-blur-sm shadow-sm shadow-purple-100">
        <div className="flex items-center gap-4">
          {/* MAGIC Logo */}
          <img
            src={magicLogo}
            alt="MAGIC Digital Marketing Agency"
            className="h-12 w-12 object-contain"
          />

          {/* Divider */}
          <div className="h-8 w-px bg-purple-200" />

          {/* Title */}
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black tracking-tight text-purple-900">MAGIC</span>
              <span className="text-xl font-light text-purple-400">Marketing Timeline</span>
            </div>
            <p className="text-[11px] font-medium tracking-widest text-purple-300 uppercase">Internal task tracker — Q1 2026</p>
          </div>

          {/* Spacer + today badge */}
          <div className="ml-auto">
            <span className="rounded-full bg-purple-50 border border-purple-200 px-3 py-1 text-xs font-semibold text-purple-500">
              {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
      </header>

      <main className="p-8 max-w-screen-2xl mx-auto">

        {/* ── Overdue Tasks ───────────────────────────────────────────────────── */}
        <TaskTable
          title="Overdue Tasks"
          badge="bg-red-400"
          tasks={displayOverdue}
          isLoading={isSyncing}
          clientStats={displayClientStats}
          remarks={remarks}
          onUpdateRemark={updateRemark}
        />

        {/* ── Upcoming Deadlines ──────────────────────────────────────────────── */}
        <TaskTable
          title="Upcoming Deadlines"
          badge="bg-purple-400"
          tasks={displayUpcoming}
          isLoading={isSyncing}
          clientStats={displayClientStats}
          remarks={remarks}
          onUpdateRemark={updateRemark}
        />

        {/* ── Connected Data Sources (bottom) ─────────────────────────────────── */}
        <div className="mt-4 rounded-2xl border border-purple-100 bg-white p-6 shadow-sm">

          {/* Card Header */}
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-purple-900">
                Connected Data Sources
              </h2>
              <p className="mt-0.5 text-xs text-purple-300">
                Google Sheets — paste a sheet URL and click "Add Sheet" to connect
              </p>
              {sheets.length > 0 && (
                <button
                  onClick={copyShareLink}
                  className="mt-2 flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-600 transition hover:bg-purple-100 active:scale-95"
                >
                  {copied ? (
                    <><svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg><span className="text-green-600">Copied!</span></>
                  ) : (
                    <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>Copy share link</>
                  )}
                </button>
              )}
            </div>

            {/* Sync Button */}
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                onClick={syncData}
                disabled={isSyncing || sheets.length === 0}
                title={sheets.length === 0 ? "Add at least one sheet to sync" : "Sync all sheets"}
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all
                  ${isSyncing
                    ? "cursor-not-allowed bg-purple-400"
                    : sheets.length === 0
                      ? "cursor-not-allowed bg-gray-200 text-gray-400"
                      : "bg-purple-600 hover:bg-purple-700 active:scale-95"
                  }`}
              >
                {isSyncing ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Syncing…</>
                ) : (
                  <><IconSync className="h-4 w-4" />Sync Data</>
                )}
              </button>
              {lastSynced && !isSyncing && (
                <span className="text-xs text-purple-300">
                  Last synced: {lastSynced.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>

          {/* Error Banner */}
          {syncError && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <IconWarning className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-700">Sync failed</p>
                <p className="mt-0.5 text-xs text-red-500">{syncError}</p>
              </div>
              <button onClick={() => setSyncError(null)} className="ml-auto shrink-0 text-xs text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          {/* URL Input */}
          <div className="flex gap-2">
            <input
              type="url"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="min-w-0 flex-1 rounded-xl border border-purple-100 px-4 py-2.5 text-sm text-gray-700 placeholder-purple-200 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            />
            <button
              onClick={addSheet}
              className="shrink-0 rounded-xl bg-purple-800 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-purple-900 active:scale-95"
            >
              Add Sheet
            </button>
          </div>

          {/* Sheet List */}
          <div className="mt-4">
            {sheets.length === 0 ? (
              <p className="py-4 text-center text-xs text-purple-200">No sheets connected yet</p>
            ) : (
              <ul className="space-y-2">
                {sheets.map((sheet) => (
                  <li key={sheet.id} className="flex items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/50 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <IconCheck className="h-4 w-4 shrink-0 text-purple-400" />
                      <span className="truncate text-sm text-gray-600">{sheet.url}</span>
                    </div>
                    <button
                      onClick={() => removeSheet(sheet.id)}
                      className="ml-2 shrink-0 rounded-lg p-1 text-purple-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="Remove"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
