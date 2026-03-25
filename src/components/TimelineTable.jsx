import { useState, Fragment } from "react"

// ─── Mock Data ────────────────────────────────────────────────────────────────

export const overdueTasks = [
  { id: 1, clientName: "True Corporation", done: false, month: "MAR",      topic: "Q4 Strategy Deck",         responsibility: "Strategy Team",     dueDate: "2026-03-03" },
  { id: 2, clientName: "Nike TH",          done: false, month: "MAR",      topic: "Idea – Brief from Client", responsibility: "Account Executive", dueDate: "2026-03-08" },
  { id: 3, clientName: "Nike TH",          done: false, month: "Internal", topic: "Revise Campaign Concept",  responsibility: "Creative Director", dueDate: "2026-03-10" },
  { id: 4, clientName: "PTT Exploration",  done: false, month: "MAR",      topic: "Present Idea to Client",   responsibility: "Creative Director", dueDate: "2026-03-13" },
  { id: 5, clientName: "PTT Exploration",  done: false, month: "Internal", topic: "Revise Internal Proposal", responsibility: "Account Manager",   dueDate: "2026-03-17" },
]
export const upcomingTasks = [
  { id: 6, clientName: "True Corporation", done: false, month: "MAR",      topic: "Content Production & Asset Delivery", responsibility: "Content Team",      dueDate: "2026-03-19" },
  { id: 7, clientName: "Nike TH",          done: false, month: "MAR",      topic: "Campaign Launch Review",              responsibility: "Account Manager",   dueDate: "2026-03-21" },
  { id: 8, clientName: "PTT Exploration",  done: false, month: "Internal", topic: "Final Report to Client",              responsibility: "Account Executive", dueDate: "2026-03-25" },
  { id: 9, clientName: "True Corporation", done: false, month: "MAR",      topic: "Post-Campaign Analysis",              responsibility: "Strategy Team",     dueDate: "2026-03-27" },
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
    if (!acc[task.clientName]) acc[task.clientName] = []
    acc[task.clientName].push(task)
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

function StatusCell({ done, compact }) {
  const size = compact ? "h-6 w-6" : "h-7 w-7"
  const icon = compact ? "h-3.5 w-3.5" : "h-4 w-4"
  return (
    <td className={compact ? "px-6 py-2.5" : "px-6 py-4"}>
      {done ? (
        <span className={`inline-flex items-center justify-center rounded-full bg-green-100 ${size}`}>
          <svg className={`text-green-600 ${icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      ) : (
        <span className={`inline-flex items-center justify-center rounded-full bg-red-100 ${size}`}>
          <svg className={`text-red-400 ${icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      )}
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
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
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
      <td className="px-5 py-4"><div className="h-6 w-16 rounded-lg bg-purple-100" /></td>
      <td className="px-6 py-4"><div className="h-5 w-32 rounded-full bg-purple-100" /></td>
      <td className="px-6 py-4"><div className="h-4 w-48 rounded bg-gray-200" /></td>
      <td className="px-6 py-4"><div className="h-4 w-32 rounded bg-gray-200" /></td>
      <td className="px-6 py-4"><div className="h-4 w-24 rounded bg-gray-200" /></td>
      <td className="px-6 py-4"><div className="h-6 w-20 rounded-full bg-gray-200" /></td>
      <td className="px-4 py-4"><div className="h-4 w-24 rounded bg-gray-100" /></td>
    </tr>
  )
}

// ─── TaskTable ────────────────────────────────────────────────────────────────

export default function TaskTable({ title, badge, tasks, isLoading, clientStats = {}, remarks = {}, onUpdateRemark }) {
  const [expanded, setExpanded] = useState(new Set())

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
              <th className="px-5 py-4">Month</th>
              <th className="px-6 py-4">
                <span className="flex items-center gap-1.5"><SheetTabIcon />Client Name</span>
              </th>
              <th className="px-6 py-4">Content / Topic</th>
              <th className="px-6 py-4">Responsibility</th>
              <th className="px-6 py-4">Due Date</th>
              <th className="px-6 py-4">Days Late</th>
              <th className="px-4 py-4">Remark</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-purple-50">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)

            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-purple-200">
                  No tasks found — sync a Google Sheet to load data
                </td>
              </tr>

            ) : groupList.map(([clientName, clientTasks], groupIdx) => {
              const isOpen  = expanded.has(clientName)
              const first   = clientTasks[0]
              const hasMore = clientTasks.length > 1
              const stats   = clientStats[clientName]

              const rowBg    = groupIdx % 2 === 0 ? "bg-white"             : "bg-purple-50/40"
              const rowHover = groupIdx % 2 === 0 ? "hover:bg-purple-50/50" : "hover:bg-purple-100/40"
              const subBg    = groupIdx % 2 === 0 ? "bg-purple-50/30"      : "bg-purple-100/30"
              const subHover = groupIdx % 2 === 0 ? "hover:bg-purple-50/60" : "hover:bg-purple-100/50"

              return (
                <Fragment key={clientName}>
                  {/* Group summary row */}
                  <tr
                    onClick={() => hasMore && toggle(clientName)}
                    className={`transition-colors ${rowBg} ${hasMore ? `cursor-pointer ${rowHover}` : rowHover}`}
                  >
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
                      </div>
                    </td>

                    <td className="px-6 py-4 font-medium text-gray-800">{first.topic}</td>
                    <td className="px-6 py-4 text-gray-500">{first.responsibility}</td>
                    <td className="px-6 py-4 text-gray-500">{fmtDate(first.dueDate)}</td>
                    <DaysLateCell dueDate={first.dueDate} done={first.done} />
                    <RemarkCell
                      taskKey={`${clientName}::${first.topic}`}
                      remarks={remarks}
                      onUpdate={handleRemark}
                    />
                  </tr>

                  {/* Expanded sub-rows */}
                  {isOpen && clientTasks.map((task) => (
                    <tr key={task.id} className={`${subBg} transition-colors ${subHover}`}>
                      <MonthCell month={task.month} compact />
                      <td className="py-2.5 pl-14 pr-6">
                        <span className="text-xs text-purple-200">└</span>
                      </td>
                      <td className="px-6 py-2.5 text-gray-600">{task.topic}</td>
                      <td className="px-6 py-2.5 text-gray-400">{task.responsibility}</td>
                      <td className="px-6 py-2.5 text-gray-400">{fmtDate(task.dueDate)}</td>
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
