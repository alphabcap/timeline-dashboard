import { useState, useEffect } from "react"
import TaskTable, { overdueTasks, upcomingTasks, doneTasks, mockClientStats, CompletedClients } from "./components/TimelineTable"
import TimelineView from "./components/TimelineView"
import { fetchAllSheetsData, categorizeTasks, parseSheetId } from "./lib/sheetsApi"
import { matchMembers, loadTeamMembers, saveTeamMembers, refreshTeamMembers } from "./lib/teamConfig"
import { loadTeamFromGist, saveTeamToGist, gistConfigured } from "./lib/gistStorage"
import TeamFilterBar from "./components/TeamFilterBar"
import TeamManager from "./components/TeamManager"
import DashboardView from "./components/DashboardView"
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

const SYNC_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes between auto-syncs

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
  const [viewMode, setViewMode]     = useState("table")
  const [filterMember, setFilterMember] = useState(null) // null = all, "Tony" = filter by Tony
  const [showTeamManager, setShowTeamManager] = useState(false)
  const [teamMembers, setTeamMembers] = useState(() => loadTeamMembers())
  const [gistSyncing, setGistSyncing] = useState(false)

  // On first load, pull latest team data from Gist (shared across all users)
  useEffect(() => {
    if (!gistConfigured) return
    loadTeamFromGist().then((remote) => {
      if (!Array.isArray(remote) || remote.length === 0) return
      saveTeamMembers(remote)
      refreshTeamMembers()
      setTeamMembers(remote)
    })
  }, [])

  const updateTeamMembers = (newMembers) => {
    saveTeamMembers(newMembers)
    refreshTeamMembers()
    setTeamMembers(newMembers)
    // Persist to Gist so all users stay in sync
    console.log("[App] updateTeamMembers called, gistConfigured:", gistConfigured)
    if (gistConfigured) {
      setGistSyncing(true)
      saveTeamToGist(newMembers)
        .then((ok) => console.log("[App] Gist save result:", ok))
        .finally(() => setGistSyncing(false))
    }
  }

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

  // Team assignments — persisted to localStorage, keyed by clientName
  // Format: { "Nike TH": { creative: "Tony", ae: "Pleng", pm: "Boom" }, ... }
  const [assignments, setAssignments] = useState(() => {
    try { return JSON.parse(localStorage.getItem("magic-assignments") || "{}") }
    catch { return {} }
  })
  useEffect(() => {
    localStorage.setItem("magic-assignments", JSON.stringify(assignments))
  }, [assignments])
  const updateAssignment = (clientName, value) => {
    setAssignments((prev) => {
      const next = { ...prev }
      if (value && Object.keys(value).length > 0) next[clientName] = value
      else delete next[clientName]
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

  // ── Auto-assign: ดึงชื่อจาก responsibility text → assign ตาม role อัตโนมัติ ──
  useEffect(() => {
    const allTasks = liveTasks?.allTasks ?? [...overdueTasks, ...upcomingTasks, ...doneTasks]
    if (allTasks.length === 0) return

    // Group tasks by clientName
    const tasksByClient = {}
    allTasks.forEach((t) => {
      if (!tasksByClient[t.clientName]) tasksByClient[t.clientName] = []
      tasksByClient[t.clientName].push(t)
    })

    setAssignments((prev) => {
      const next = { ...prev }
      let changed = false

      Object.entries(tasksByClient).forEach(([clientName, tasks]) => {
        // Skip if client already has any manual assignment
        if (next[clientName] && Object.keys(next[clientName]).length > 0) return

        // Scan all tasks' responsibility text for this client
        const found = {}
        tasks.forEach((t) => {
          const matched = matchMembers(t.responsibility)
          matched.forEach((m) => {
            // First match per role wins
            if (!found[m.role]) found[m.role] = m.name
          })
        })

        if (Object.keys(found).length > 0) {
          next[clientName] = found
          changed = true
        }
      })

      return changed ? next : prev
    })
  }, [liveTasks]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter by team member ──
  // Check BOTH: client-level assignment AND per-task responsibility
  const memberFilter = (task) => {
    if (!filterMember) return true
    // 1. Check client-level assignment
    const clientAssign = assignments[task.clientName]
    if (clientAssign) {
      const assignedNames = Object.values(clientAssign)
      if (assignedNames.includes(filterMember)) return true
    }
    // 2. Fallback: check task responsibility text
    const members = matchMembers(task.responsibility)
    return members.some((m) => m.name === filterMember)
  }

  const rawOverdue     = liveTasks ? liveTasks.overdue     : overdueTasks
  const rawUpcoming    = liveTasks ? liveTasks.upcoming    : upcomingTasks
  const displayClientStats = liveTasks ? liveTasks.clientStats : mockClientStats
  const rawAllTasks    = liveTasks?.allTasks ?? [...overdueTasks, ...upcomingTasks, ...doneTasks]

  const displayOverdue  = filterMember ? rawOverdue.filter(memberFilter)  : rawOverdue
  const displayUpcoming = filterMember ? rawUpcoming.filter(memberFilter) : rawUpcoming
  const displayAllTasks = filterMember ? rawAllTasks.filter(memberFilter) : rawAllTasks

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
      const { overdue, upcoming, clientStats, allTasks: tasksWithDates } = categorizeTasks(allTasks)
      setLiveTasks({ overdue, upcoming, clientStats, allTasks: tasksWithDates })
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
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm shadow-[0_1px_3px_rgba(147,51,234,0.08)]">
        {/* Row 1: Logo + View tabs + actions */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2">
          {/* Left: Logo + Brand */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <img src={magicLogo} alt="MAGIC Digital Marketing Agency" className="h-7 w-7 sm:h-8 sm:w-8 object-contain" />
            <div className="hidden sm:block leading-tight">
              <span className="text-sm font-black tracking-tight text-purple-900">MAGIC</span>
              <span className="text-sm font-light text-purple-400 ml-1">Timeline</span>
            </div>
          </div>

          <div className="h-6 w-px bg-purple-100 shrink-0" />

          {/* Center: View tabs */}
          <div className="flex items-center gap-0.5 rounded-lg bg-purple-50/80 p-0.5 shrink-0">
            {[
              { mode: "table", label: "Table", icon: "M3 10h18M3 6h18M3 14h18M3 18h18" },
              { mode: "timeline", label: "Timeline", icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" },
              { mode: "dashboard", label: "Dashboard", icon: "M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-2a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" },
            ].map(({ mode, label, icon }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1 rounded-md px-2 sm:px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  viewMode === mode
                    ? "bg-white text-purple-700 shadow-sm"
                    : "text-purple-400 hover:text-purple-600"
                }`}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Desktop only: divider + filter chips inline */}
          <div className="hidden sm:block h-6 w-px bg-purple-100 shrink-0" />
          <div className="hidden sm:flex flex-1 min-w-0 overflow-x-auto scrollbar-hide">
            <TeamFilterBar activeMember={filterMember} onSelect={setFilterMember} members={teamMembers} />
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {filterMember && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[9px] font-medium text-purple-500 hidden lg:block">
                Filtered: <strong>{filterMember}</strong>
              </span>
            )}
            <button
              onClick={() => setShowTeamManager(true)}
              className="flex items-center gap-1 rounded-lg border border-purple-200/60 bg-purple-50/50 px-2 py-1 text-[10px] font-semibold text-purple-400 transition hover:bg-purple-100 hover:text-purple-600 active:scale-95"
              title={gistSyncing ? "กำลังบันทึก..." : "จัดการทีม"}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">จัดการทีม</span>
            </button>
            <span className="rounded-md bg-purple-50 px-2 py-1 text-[10px] font-semibold text-purple-500 tabular-nums hidden md:block">
              {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* Row 2 (mobile only): Filter chips — full width, easy to tap */}
        <div className="sm:hidden overflow-x-auto scrollbar-hide border-t border-purple-100/60 px-3 py-1.5">
          <TeamFilterBar activeMember={filterMember} onSelect={setFilterMember} members={teamMembers} />
        </div>
      </header>

      <main className="p-3 sm:p-8 max-w-screen-2xl mx-auto">

        {/* Team Manager Modal */}
        <TeamManager
          members={teamMembers}
          onUpdate={updateTeamMembers}
          open={showTeamManager}
          onClose={() => setShowTeamManager(false)}
        />

        <div key={viewMode} className="animate-magic-view">
        {viewMode === "table" ? (
          <>
            {/* ── Overdue Tasks ───────────────────────────────────────────────── */}
            <TaskTable
              title="Overdue Tasks"
              badge="bg-red-400"
              tasks={displayOverdue}
              isLoading={isSyncing}
              clientStats={displayClientStats}
              remarks={remarks}
              onUpdateRemark={updateRemark}
              assignments={assignments}
              onUpdateAssignment={updateAssignment}
            />

            {/* ── Upcoming Deadlines ──────────────────────────────────────────── */}
            <TaskTable
              title="Upcoming Deadlines"
              badge="bg-purple-400"
              tasks={displayUpcoming}
              isLoading={isSyncing}
              clientStats={displayClientStats}
              remarks={remarks}
              onUpdateRemark={updateRemark}
              assignments={assignments}
              onUpdateAssignment={updateAssignment}
            />

            {/* ── Completed Clients (100% done) ────────────────────────────── */}
            <CompletedClients
              allTasks={displayAllTasks}
              assignments={assignments}
              onUpdateAssignment={updateAssignment}
            />
          </>
        ) : viewMode === "timeline" ? (
          /* ── Timeline View ────────────────────────────────────────────────── */
          <TimelineView
            allTasks={displayAllTasks}
            isLoading={isSyncing}
            assignments={assignments}
            onUpdateAssignment={updateAssignment}
          />
        ) : (
          /* ── Dashboard View ───────────────────────────────────────────────── */
          <DashboardView
            allTasks={displayAllTasks}
            allTasksUnfiltered={rawAllTasks}
            overdue={displayOverdue}
            upcoming={displayUpcoming}
            clientStats={displayClientStats}
            assignments={assignments}
            onUpdateAssignment={updateAssignment}
            onResync={syncData}
            teamMembers={teamMembers}
          />
        )}
        </div>

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
