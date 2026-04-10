import { useState, Fragment, useMemo } from "react"
import { buildFileColorMap } from "../lib/sheetsApi"
import AssignTeam from "./AssignTeam"

// ─── Mock Data ────────────────────────────────────────────────────────────────

export const overdueTasks = [
  { id: 1, clientName: "True Corporation", done: false, month: "MAR",      topic: "Q4 Strategy Deck",         responsibility: "Tony",        dueDate: "2026-03-03" },
  { id: 2, clientName: "Nike TH",          done: false, month: "MAR",      topic: "Idea – Brief from Client", responsibility: "Pleng",       dueDate: "2026-03-08" },
  { id: 3, clientName: "Nike TH",          done: false, month: "Internal", topic: "Revise Campaign Concept",  responsibility: "RK, Boom",    dueDate: "2026-03-10" },
  { id: 4, clientName: "PTT Exploration",  done: false, month: "MAR",      topic: "Present Idea to Client",   responsibility: "Tony, Pleng", dueDate: "2026-03-13" },
  { id: 5, clientName: "PTT Exploration",  done: false, month: "Internal", topic: "Revise Internal Proposal", responsibility: "Aom, Point",  dueDate: "2026-03-17" },
]
export const upcomingTasks = [
  { id: 6, clientName: "True Corporation", done: false, month: "MAR",      topic: "Content Production & Asset Delivery", responsibility: "RK, Aom",     dueDate: "2026-03-19" },
  { id: 7, clientName: "Nike TH",          done: false, month: "MAR",      topic: "Campaign Launch Review",              responsibility: "Boom",        dueDate: "2026-03-21" },
  { id: 8, clientName: "PTT Exploration",  done: false, month: "Internal", topic: "Final Report to Client",              responsibility: "Pleng, Boom", dueDate: "2026-03-25" },
  { id: 9, clientName: "True Corporation", done: false, month: "MAR",      topic: "Post-Campaign Analysis",              responsibility: "Tony, Point", dueDate: "2026-03-27" },
]

// Mock done tasks for demo (includes a 100% done client: "SCB")
export const doneTasks = [
  { id: 10, clientName: "True Corporation", done: true, month: "MAR",      topic: "Client Kickoff Meeting",    responsibility: "Pleng",       dueDate: "2026-03-01" },
  { id: 11, clientName: "Nike TH",          done: true, month: "MAR",      topic: "Brand Guidelines Review",   responsibility: "Tony, RK",    dueDate: "2026-03-05" },
  { id: 12, clientName: "PTT Exploration",  done: true, month: "Internal", topic: "Internal Brief Submission", responsibility: "Boom, Point", dueDate: "2026-03-07" },
  { id: 13, clientName: "Nike TH",          done: true, month: "MAR",      topic: "Mood Board Presentation",   responsibility: "RK",          dueDate: "2026-03-09" },
  // 100% done client for demo
  { id: 14, clientName: "SCB",              done: true, month: "FEB",      topic: "Campaign Wrap-up",          responsibility: "Tony, Aom",   dueDate: "2026-02-20" },
  { id: 15, clientName: "SCB",              done: true, month: "FEB",      topic: "Final Report Delivery",     responsibility: "Boom",        dueDate: "2026-02-25" },
]

// Mock progress stats for demo mode (before syncing real data)
export const mockClientStats = {
  "True Corporation": { total: 8,  done: 3 },  // 37%
  "Nike TH":          { total: 7,  done: 4 },  // 57%
  "PTT Exploration":  { total: 6,  done: 1 },  // 17%
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysFromToday(dueDate) {
  if (!dueDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(dueDate); due.setHours(0, 0, 0, 0)
  return Math.floor((due - today) / (1000 * 60 * 60 * 24))
}

function groupByClient(tasks) {
  return tasks.reduce((acc, task) => {
    const key = `${task.clientName}::${task.spreadsheetId}`
    if (!acc[key]) acc[key] = []
    acc[key].push(task)
    return acc
  }, {})
}

function fmtDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

/** Smooth red→yellow→green color based on completion % */
function progressColor(pct) {
  const hue = Math.round(pct * 1.2) // 0 = red (0°), 100 = green (120°)
  return `hsl(${hue}, 65%, 46%)`
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SheetTabIcon() {
  return (
    <svg className="h-3 w-3 shrink-0 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 text-purple-300 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ─── Cell Components ──────────────────────────────────────────────────────────

function MonthCell({ month, compact }) {
  const pad = compact ? "px-5 py-2.5" : "px-5 py-4"
  if (!month) return <td className={`${pad} text-purple-200`}>—</td>
  const isInternal = month.toLowerCase() === "internal"
  return (
    <td className={pad}>
      <span className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-black tracking-widest uppercase ${
        isInternal ? "bg-purple-600 text-white shadow-sm shadow-purple-300" : "bg-purple-100 text-purple-600"
      }`}>
        {month}
      </span>
    </td>
  )
}

function StatusToggleCell({ task, onToggle, compact }) {
  const size = compact ? "h-6 w-6" : "h-7 w-7"
  const icon = compact ? "h-3.5 w-3.5" : "h-4 w-4"
  const handleClick = (e) => {
    e.stopPropagation()
    if (onToggle) onToggle(task, !task.done)
  }
  return (
    <td className={compact ? "px-4 py-2.5" : "px-4 py-4"}>
      <button
        onClick={handleClick}
        title={task.done ? "คลิกเพื่อยกเลิก" : "คลิกเพื่อ Mark Done"}
        className={`inline-flex items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 cursor-pointer ${size} ${
          task.done ? "bg-green-100 hover:bg-green-200" : "bg-red-100 hover:bg-red-200"
        }`}
      >
        {task.done ? (
          <svg className={`text-green-600 ${icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className={`text-red-400 ${icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </button>
    </td>
  )
}

function ActualSubmitCell({ actualSubmit, compact }) {
  const pad = compact ? "px-5 py-2.5" : "px-5 py-4"
  if (!actualSubmit) return <td className={`${pad} text-gray-200 text-xs`}>—</td>
  return (
    <td className={pad}>
      <span className="text-xs font-medium text-green-600">{fmtDate(actualSubmit)}</span>
    </td>
  )
}

function overdueConfig(absDays) {
  if (absDays >= 15) return { cls: "bg-red-500 text-white",   emoji: "💀" }
  if (absDays >= 10) return { cls: "bg-red-300 text-red-900", emoji: "🔥" }
  if (absDays >=  6) return { cls: "bg-red-200 text-red-800", emoji: "😰" }
  if (absDays >=  3) return { cls: "bg-red-100 text-red-700", emoji: "😬" }
                     return { cls: "bg-red-50  text-red-500", emoji: ""   }
}

function DaysLateCell({ dueDate, done, compact }) {
  const pad = compact ? "px-6 py-2.5" : "px-6 py-4"
  if (!dueDate) return <td className={`${pad} text-gray-300`}>—</td>
  if (done)     return <td className={pad}><span className="text-xs font-medium text-gray-400">Done</span></td>

  const days = daysFromToday(dueDate)
  if (days === null) return <td className={`${pad} text-gray-300`}>—</td>

  if (days < 0) {
    const { cls, emoji } = overdueConfig(Math.abs(days))
    return (
      <td className={pad}>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${cls} ${Math.abs(days) >= 6 ? "animate-overdue-glow" : "animate-overdue-pulse"}`}>
          {emoji && <span>{emoji}</span>}<span>{days} days</span>
        </span>
      </td>
    )
  }
  if (days === 0) return (
    <td className={pad}>
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-600">
        🔔 <span>Today</span>
      </span>
    </td>
  )
  if (days <= 3) return (
    <td className={pad}>
      <span className="inline-block rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">+{days} days</span>
    </td>
  )
  return (
    <td className={pad}>
      <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">+{days} days</span>
    </td>
  )
}

// ─── Remark Cell ──────────────────────────────────────────────────────────────

function RemarkCell({ taskKey, remarks, onUpdate, compact }) {
  const value   = remarks[taskKey] || ""
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft  ] = useState("")

  const startEdit = () => { setDraft(value); setEditing(true) }
  const save      = () => { onUpdate(taskKey, draft.trim()); setEditing(false) }
  const cancel    = () => setEditing(false)
  const clear     = (e) => { e.stopPropagation(); onUpdate(taskKey, "") }

  const pad = compact ? "px-4 py-2.5" : "px-4 py-4"

  if (editing) {
    return (
      <td className={pad}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter")  save()
            if (e.key === "Escape") cancel()
          }}
          placeholder="เพิ่ม note..."
          className="w-36 rounded-lg border border-purple-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-purple-200"
        />
      </td>
    )
  }

  return (
    <td className={pad}>
      <div onClick={startEdit} className="group flex min-w-[80px] cursor-pointer items-center gap-1.5">
        {value ? (
          <>
            <span className="flex-1 text-xs text-gray-500 group-hover:text-purple-700 line-clamp-2 max-w-[140px]">{value}</span>
            <button
              onClick={clear}
              className="shrink-0 rounded p-0.5 text-gray-200 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        ) : (
          <span className="text-xs italic text-purple-200 transition-colors group-hover:text-purple-400">
            + note
          </span>
        )}
      </div>
    </td>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ stats }) {
  if (!stats || stats.total === 0) return null
  const pct   = Math.round((stats.done / stats.total) * 100)
  const color = progressColor(pct)
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
        {pct}%
      </span>
      <span className="text-[10px] text-gray-300">{stats.done}/{stats.total}</span>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-4"><div className="h-7 w-7 rounded-full bg-red-100" /></td>
      <td className="px-5 py-4"><div className="h-6 w-16 rounded-lg bg-purple-100" /></td>
      <td className="px-6 py-4"><div className="h-5 w-32 rounded-full bg-purple-100" /></td>
      <td className="px-6 py-4"><div className="h-4 w-48 rounded bg-gray-200" /></td>
      <td className="px-6 py-4"><div className="h-4 w-32 rounded bg-gray-200" /></td>
      <td className="px-6 py-4"><div className="h-4 w-24 rounded bg-gray-200" /></td>
      <td className="px-5 py-4"><div className="h-4 w-24 rounded bg-gray-100" /></td>
      <td className="px-6 py-4"><div className="h-6 w-20 rounded-full bg-gray-200" /></td>
      <td className="px-4 py-4"><div className="h-4 w-24 rounded bg-gray-100" /></td>
    </tr>
  )
}

// ─── TaskTable ────────────────────────────────────────────────────────────────

export default function TaskTable({ title, badge, tasks, isLoading, clientStats = {}, remarks = {}, onUpdateRemark, assignments = {}, onUpdateAssignment, onToggle }) {
  const [expanded, setExpanded] = useState(new Set())
  const fileColorMap = useMemo(() => buildFileColorMap(tasks), [tasks])

  const toggle = (name) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  const grouped   = groupByClient(tasks)
  const groupList = Object.entries(grouped)

  const handleRemark = onUpdateRemark || (() => {})

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        {badge && <span className={`h-2 w-2 rounded-full ${badge}`} />}
        <h2 className="text-xs font-bold uppercase tracking-widest text-purple-400">{title}</h2>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-purple-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-purple-100 bg-purple-50 text-left text-[11px] font-bold uppercase tracking-wider text-purple-400">
              <th className="px-4 py-4">Status</th>
              <th className="px-5 py-4">Month</th>
              <th className="px-6 py-4">
                <span className="flex items-center gap-1.5"><SheetTabIcon />Client Name</span>
              </th>
              <th className="px-6 py-4">Content / Topic</th>
              <th className="px-6 py-4">Responsibility</th>
              <th className="px-6 py-4">Due Date</th>
              <th className="px-5 py-4">Actual Submit</th>
              <th className="px-6 py-4">Days Late</th>
              <th className="px-4 py-4">Remark</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-purple-50">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)

            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center text-sm text-purple-200">
                  No tasks found — sync a Google Sheet to load data
                </td>
              </tr>

            ) : groupList.map(([groupKey, clientTasks], groupIdx) => {
              const clientName = clientTasks[0].clientName
              const isOpen  = expanded.has(groupKey)
              const first   = clientTasks[0]
              const hasMore = clientTasks.length > 1
              const stats   = clientStats[groupKey]

              // File-level background color
              const fc = fileColorMap[first.spreadsheetId || first.month || "unknown"]
              const rowBg    = fc ? fc.bg : (groupIdx % 2 === 0 ? "bg-white" : "bg-purple-50/40")
              const rowHover = "hover:brightness-[0.97]"
              const subBg    = fc ? fc.bg : (groupIdx % 2 === 0 ? "bg-purple-50/30" : "bg-purple-100/30")
              const subHover = "hover:brightness-[0.95]"

              return (
                <Fragment key={groupKey}>
                  {/* Group summary row */}
                  <tr
                    onClick={() => hasMore && toggle(groupKey)}
                    className={`transition-colors ${rowBg} ${hasMore ? `cursor-pointer ${rowHover}` : rowHover} animate-magic-enter`}
                    style={{ animationDelay: `${Math.min(groupIdx, 10) * 60}ms` }}
                  >
                    <StatusToggleCell task={first} onToggle={onToggle} />
                    <MonthCell month={first.month} />

                    {/* Client Name + Progress Bar */}
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-2">
                        {hasMore ? <ChevronIcon open={isOpen} /> : <span className="w-3.5 shrink-0" />}
                        <div className="min-w-0">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700">
                            <SheetTabIcon />
                            {clientName}
                            {hasMore && (
                              <span className="ml-0.5 rounded-full bg-purple-200 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">
                                {clientTasks.length}
                              </span>
                            )}
                          </span>
                          <ProgressBar stats={stats} />
                        </div>
                        <AssignTeam
                          clientName={clientName}
                          assignments={assignments}
                          onUpdate={onUpdateAssignment || (() => {})}
                          compact
                        />
                      </div>
                    </td>

                    <td className="px-6 py-4 font-medium text-gray-800">
                      {first.topic}
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${first.spreadsheetId}/edit#gid=${first.sheetGid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1.5 inline-block text-gray-300 hover:text-blue-500 transition-colors"
                        title="Open in Google Sheets"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg className="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
                      </a>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{first.responsibility}</td>
                    <td className="px-6 py-4 text-gray-500">{fmtDate(first.dueDate)}</td>
                    <ActualSubmitCell actualSubmit={first.actualSubmit} />
                    <DaysLateCell dueDate={first.dueDate} done={first.done} />
                    <RemarkCell
                      taskKey={`${clientName}::${first.topic}`}
                      remarks={remarks}
                      onUpdate={handleRemark}
                    />
                  </tr>

                  {/* Expanded sub-rows */}
                  {isOpen && clientTasks.map((task, subIdx) => (
                    <tr key={task.id} className={`${subBg} transition-colors ${subHover} animate-magic-enter`} style={{ animationDelay: `${subIdx * 40}ms` }}>
                      <StatusToggleCell task={task} onToggle={onToggle} compact />
                      <MonthCell month={task.month} compact />
                      <td className="py-2.5 pl-14 pr-6">
                        <span className="text-xs text-purple-200">└</span>
                      </td>
                      <td className="px-6 py-2.5 text-gray-600">
                        {task.topic}
                        <a
                          href={`https://docs.google.com/spreadsheets/d/${task.spreadsheetId}/edit#gid=${task.sheetGid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1.5 inline-block text-gray-300 hover:text-blue-500 transition-colors"
                          title="Open in Google Sheets"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
                        </a>
                      </td>
                      <td className="px-6 py-2.5 text-gray-400">{task.responsibility}</td>
                      <td className="px-6 py-2.5 text-gray-400">{fmtDate(task.dueDate)}</td>
                      <ActualSubmitCell actualSubmit={task.actualSubmit} compact />
                      <DaysLateCell dueDate={task.dueDate} done={task.done} compact />
                      <RemarkCell
                        taskKey={`${clientName}::${task.topic}`}
                        remarks={remarks}
                        onUpdate={handleRemark}
                        compact
                      />
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {!isLoading && (
        <p className="mt-2 text-right text-xs text-purple-300">
          {groupList.length} {groupList.length === 1 ? "client" : "clients"} · {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </p>
      )}
    </div>
  )
}

// ─── Completed Clients Section ───────────────────────────────────────────────

export function CompletedClients({ allTasks, assignments = {}, onUpdateAssignment }) {
  if (!allTasks || allTasks.length === 0) return null

  // Calculate stats from allTasks directly (not from clientStats which may be stale)
  const statsMap = {}
  allTasks.forEach((t) => {
    if (!statsMap[t.clientName]) statsMap[t.clientName] = { total: 0, done: 0 }
    statsMap[t.clientName].total++
    if (t.done) statsMap[t.clientName].done++
  })

  // Find clients where 100% tasks are done
  const completedClients = Object.entries(statsMap)
    .filter(([, s]) => s.total > 0 && s.done >= s.total)
    .map(([name, stats]) => {
      const tasks = allTasks.filter((t) => t.clientName === name)
      const dates = tasks.filter((t) => t.dueDate).map((t) => new Date(t.dueDate)).sort((a, b) => a - b)
      return {
        name,
        taskCount: stats.total,
        startDate: dates[0] || null,
        endDate: dates[dates.length - 1] || null,
        month: tasks[0]?.month || "",
      }
    })

  if (completedClients.length === 0) return null

  const fmt = (d) => d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"
  const handleAssign = onUpdateAssignment || (() => {})

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="text-xs font-bold uppercase tracking-widest text-green-500">Completed</h2>
        <span className="text-[10px] text-green-400">{completedClients.length} clients · 100% done</span>
      </div>

      <div className="space-y-2">
        {completedClients.map((client) => (
          <div
            key={client.name}
            className="flex items-center gap-3 rounded-xl border border-green-100 bg-green-50/40 px-4 py-2.5 opacity-75 hover:opacity-100 transition-opacity"
          >
            {/* Check icon */}
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500 shadow-sm">
              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>

            {/* Client name */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
              <SheetTabIcon />
              {client.name}
            </span>

            {/* Assign team */}
            <AssignTeam
              clientName={client.name}
              assignments={assignments}
              onUpdate={handleAssign}
              compact
            />

            {/* Task count */}
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-600">
              {client.taskCount} tasks
            </span>

            {/* Month tag */}
            {client.month && (
              <span className="rounded-md bg-green-100 px-2 py-0.5 text-[9px] font-black tracking-wider uppercase text-green-600">
                {client.month}
              </span>
            )}

            {/* Date range */}
            <span className="ml-auto text-[10px] text-green-400">
              {fmt(client.startDate)} — {fmt(client.endDate)}
            </span>

            {/* 100% badge */}
            <span className="rounded-full bg-green-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
              100% ✓
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
