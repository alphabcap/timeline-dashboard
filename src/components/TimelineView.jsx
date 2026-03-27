import { useMemo, useRef, useEffect, useState, useCallback } from "react"
import { prepareTimelineData, buildFileColorMap } from "../lib/sheetsApi"
import { getClientColor } from "./TimelineBar"
import AssignTeam from "./AssignTeam"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function diffDays(dateA, dateB) {
  const a = new Date(dateA); a.setHours(0, 0, 0, 0)
  const b = new Date(dateB); b.setHours(0, 0, 0, 0)
  return Math.round((b - a) / 86_400_000)
}

function addDays(iso, n) {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d
}

function fmtDateShort(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
}

function progressColor(pct) {
  const hue = Math.round(pct * 1.2)
  return `hsl(${hue}, 65%, 46%)`
}

function daysFromToday(dueDate) {
  if (!dueDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0)
  return Math.floor((due - today) / 86_400_000)
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-purple-100 bg-white p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-3 w-3 rounded-full bg-purple-200" />
            <div className="h-4 w-28 rounded bg-purple-100" />
          </div>
          <div className="space-y-2 ml-6">
            <div className="h-6 rounded-lg bg-purple-50" style={{ width: `${60 + i * 15}%` }} />
            <div className="h-6 rounded-lg bg-purple-50" style={{ width: `${40 + i * 10}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ task }) {
  const days = daysFromToday(task.dueDate)
  if (task.done) return <span className="rounded-full bg-green-100 px-2 py-0.5 text-[9px] font-semibold text-green-700">Done</span>
  if (days === null) return null
  if (days < -14) return <span className="rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold text-white animate-overdue-glow">💀 {days}d</span>
  if (days < -6)  return <span className="rounded-full bg-red-300 px-2 py-0.5 text-[9px] font-bold text-red-900 animate-overdue-glow">🔥 {days}d</span>
  if (days < 0)   return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-semibold text-red-700 animate-overdue-pulse">{days}d</span>
  if (days === 0) return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-semibold text-orange-600">Today</span>
  if (days <= 3)  return <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[9px] font-semibold text-yellow-700">+{days}d</span>
  return <span className="rounded-full bg-green-50 px-2 py-0.5 text-[9px] font-semibold text-green-600">+{days}d</span>
}

// ─── Tick generation ─────────────────────────────────────────────────────────

function generateTicks(dateRange, totalDays) {
  const ticks = []
  if (totalDays <= 0) return ticks

  // Pick a consistent interval in days based on range
  // Short ≤25 → every 3 days, medium ≤60 → every 7, long → every 14
  const interval = totalDays <= 25 ? 3 : totalDays <= 60 ? 7 : 14

  for (let i = 0; i <= totalDays; i++) {
    const d = addDays(dateRange.start, i)
    const pos = (i / totalDays) * 100
    const dayNum = d.getDate()
    const isFirstOfMonth = dayNum === 1
    const monthLabel = d.toLocaleDateString("en-US", { month: "short" })

    if (isFirstOfMonth) {
      ticks.push({ pos, label: `1 ${monthLabel}`, major: true })
    } else if (i % interval === 0 && i > 0) {
      ticks.push({ pos, label: `${dayNum} ${monthLabel}`, major: false })
    }
  }
  return ticks
}

// ─── Date Ruler ──────────────────────────────────────────────────────────────

function DateRuler({ ticks, todayPos }) {
  return (
    <div className="sticky top-[114px] z-30 bg-gradient-to-b from-gray-50 via-gray-50 to-gray-50/95 -mx-1 px-1 pb-1">
    <div className="relative h-8 ml-[240px] mr-[108px]">
      {/* Ruler line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-purple-100" />

      {/* Tick marks */}
      {ticks.map((tick, i) => (
        <div key={i} className="absolute bottom-0 flex flex-col items-center" style={{ left: `${tick.pos}%`, transform: "translateX(-50%)" }}>
          <span className={`text-[9px] tabular-nums whitespace-nowrap mb-0.5 ${tick.major ? "font-bold text-purple-600" : "font-medium text-purple-400"}`}>
            {tick.label}
          </span>
          <div className={`w-px ${tick.major ? "h-2.5 bg-purple-400" : "h-1.5 bg-purple-200"}`} />
        </div>
      ))}

      {/* Today marker */}
      {todayPos >= 0 && todayPos <= 100 && (
        <div className="absolute bottom-0 flex flex-col items-center z-20" style={{ left: `${todayPos}%`, transform: "translateX(-50%)" }}>
          <span className="rounded-md bg-purple-600 px-1.5 py-0.5 text-[8px] font-bold text-white uppercase tracking-wide mb-0.5 whitespace-nowrap shadow-sm">
            Today · {fmtDateShort(new Date().toISOString().split("T")[0])}
          </span>
          <div className="w-0.5 h-2.5 bg-purple-600 rounded-full" />
        </div>
      )}
    </div>
    </div>
  )
}

// ─── Grid Lines (reused in bar areas) ────────────────────────────────────────

function GridLines({ ticks, todayPos }) {
  return (
    <>
      {ticks.map((tick, i) => (
        <div
          key={i}
          className={`absolute top-0 bottom-0 pointer-events-none ${tick.major ? "border-l border-dashed border-purple-200/60" : "border-l border-dotted border-purple-100/40"}`}
          style={{ left: `${tick.pos}%` }}
        />
      ))}
      {todayPos >= 0 && todayPos <= 100 && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-10 border-l-2 border-dashed border-purple-500/50"
          style={{ left: `${todayPos}%` }}
        />
      )}
    </>
  )
}

// ─── Client Timeline Card ────────────────────────────────────────────────────

function ClientCard({ client, colorIndex, dateRange, totalDays, ticks, todayPos, fileColor, assignments = {}, onUpdateAssignment, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const color = getClientColor(colorIndex)
  const stats = client.stats
  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0
  const pColor = progressColor(pct)

  // Count overdue tasks
  const overdueCount = client.tasks.filter((t) => !t.done && daysFromToday(t.dueDate) < 0).length
  const doneCount = client.tasks.filter((t) => t.done).length

  // Compute a summary bar: span from earliest start to latest due
  const summaryLeft = totalDays > 0 ? (diffDays(dateRange.start, client.startDate) / totalDays) * 100 : 0
  const summaryRight = totalDays > 0 ? (diffDays(dateRange.start, client.endDate) / totalDays) * 100 : 0
  const summaryWidth = Math.max(3, summaryRight - Math.max(0, summaryLeft))

  // File-level background color
  const fc = fileColor || { bg: "bg-white", border: "border-purple-100", tag: "bg-purple-100 text-purple-700" }

  return (
    <div className={`rounded-xl border ${fc.border} ${fc.bg} shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md`}>
      {/* Client header — clickable */}
      <div
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors select-none ${fc.bg} hover:brightness-[0.97]`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Chevron */}
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-purple-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <div className={`h-3 w-3 rounded-full shrink-0 ${color.bar}`} />
          <span className="text-sm font-semibold text-gray-800 truncate">{client.name}</span>
          <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-600">
            {client.tasks.length}
          </span>
          {overdueCount > 0 && (
            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
              {overdueCount} overdue
            </span>
          )}
          {doneCount > 0 && (
            <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-600">
              {doneCount} done
            </span>
          )}
          {client.month && (
            <span className={`shrink-0 rounded-md px-2 py-0.5 text-[9px] font-black tracking-wider uppercase ${fc.tag}`}>
              {client.month}
            </span>
          )}
          <AssignTeam
            clientName={client.name}
            assignments={assignments}
            onUpdate={onUpdateAssignment || (() => {})}
            compact
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: pColor }} />
          </div>
          <span className="text-[10px] font-bold tabular-nums" style={{ color: pColor }}>{pct}%</span>
        </div>
      </div>

      {/* Collapsed: summary bar */}
      {!open && (
        <div className="px-4 py-2">
          <div className="relative h-5 rounded-md bg-gray-50/60 overflow-hidden">
            <GridLines ticks={ticks} todayPos={todayPos} />
            <div
              className={`absolute top-1 bottom-1 rounded-md ${color.bar} opacity-80 z-[2]`}
              style={{ left: `${Math.max(0, summaryLeft)}%`, width: `${summaryWidth}%`, minWidth: "8px" }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[9px] text-purple-300 px-0.5">
            <span>{fmtDateShort(client.startDate)} — {fmtDateShort(client.endDate)}</span>
            <span className="text-purple-400 font-medium">Click to expand</span>
          </div>
        </div>
      )}

      {/* Expanded: all task rows */}
      {open && (
        <div className="relative px-4 py-2 border-t border-purple-50">
          <div className="space-y-1">
            {client.tasks.map((task, i) => {
            const startPos = totalDays > 0 ? (diffDays(dateRange.start, task.startDate || task.dueDate) / totalDays) * 100 : 0
            const endPos = totalDays > 0 ? (diffDays(dateRange.start, task.dueDate) / totalDays) * 100 : 0
            const barLeft = Math.max(0, Math.min(startPos, 100))
            const barWidth = Math.max(2.5, endPos - barLeft)
            const isOverdue = !task.done && daysFromToday(task.dueDate) < 0

            return (
              <div key={task.id} className="flex items-center gap-2 group">
                {/* Status dot + task name */}
                <div className="w-[220px] shrink-0 flex items-center gap-1.5 min-w-0">
                  {task.done ? (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-100">
                      <svg className="h-2.5 w-2.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  ) : (
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isOverdue ? "bg-red-400" : color.bar}`} />
                  )}
                  <span className={`text-[11px] truncate leading-tight ${task.done ? "text-gray-400 line-through" : "text-gray-700"}`}>
                    {task.topic}
                  </span>
                </div>

                {/* Bar area */}
                <div className="flex-1 relative h-7 rounded-md bg-gray-50/60 overflow-hidden">
                  <GridLines ticks={ticks} todayPos={todayPos} />

                  {/* Task bar */}
                  <div
                    className={`absolute top-1 bottom-1 rounded-md transition-all duration-200
                      ${task.done
                        ? `${color.light} opacity-60`
                        : isOverdue
                          ? `${color.bar} ring-1 ring-red-300/60`
                          : color.bar
                      }
                      group-hover:brightness-110 group-hover:shadow-sm
                    `}
                    style={{ left: `${barLeft}%`, width: `${barWidth}%`, minWidth: "8px" }}
                  >
                    {/* Due date label on bar (if wide enough) */}
                    {barWidth > 8 && (
                      <div className="flex h-full items-center justify-end px-1.5 overflow-hidden">
                        <span className="text-[8px] font-semibold text-white/80 whitespace-nowrap">
                          {fmtDateShort(task.dueDate)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Due date + status */}
                <div className="w-[100px] shrink-0 flex items-center justify-end gap-1.5">
                  <span className="text-[10px] text-gray-400 tabular-nums">{fmtDateShort(task.dueDate)}</span>
                  <StatusBadge task={task} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      )}
    </div>
  )
}

// ─── Completed Client Card ───────────────────────────────────────────────

function CompletedCard({ client, colorIndex, fileColor }) {
  const color = getClientColor(colorIndex)
  const fc = fileColor || { bg: "bg-green-50/40", border: "border-green-100", tag: "bg-green-100 text-green-700" }
  return (
    <div className={`flex items-center gap-3 rounded-xl border ${fc.border} ${fc.bg} px-4 py-2.5 opacity-70 hover:opacity-100 transition-opacity`}>
      {/* Check icon */}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500 shadow-sm">
        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
      {/* Client name */}
      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${color.bar} opacity-50`} />
      <span className="text-sm font-medium text-green-700 truncate">{client.name}</span>
      {/* Task count */}
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-600">
        {client.tasks.length} tasks
      </span>
      {/* Date range */}
      <span className="ml-auto text-[10px] text-green-400">
        {fmtDateShort(client.startDate)} — {fmtDateShort(client.endDate)}
      </span>
      {/* 100% badge */}
      <span className="rounded-full bg-green-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
        100% ✓
      </span>
    </div>
  )
}

// ─── Main TimelineView ───────────────────────────────────────────────────────

export default function TimelineView({ allTasks, isLoading, assignments = {}, onUpdateAssignment }) {
  const timeline = useMemo(() => {
    try {
      return prepareTimelineData(allTasks || [])
    } catch {
      return { clients: [], dateRange: { start: "", end: "" }, totalDays: 0 }
    }
  }, [allTasks])

  if (isLoading) {
    return (
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-purple-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-purple-400">Project Timeline</h2>
        </div>
        <TimelineSkeleton />
      </div>
    )
  }

  if (!allTasks || allTasks.length === 0) {
    return (
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-purple-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-purple-400">Project Timeline</h2>
        </div>
        <div className="rounded-2xl border border-purple-100 bg-white p-12 text-center">
          <p className="text-sm text-purple-200">No tasks found — sync a Google Sheet to load data</p>
        </div>
      </div>
    )
  }

  const todayStr = new Date().toISOString().split("T")[0]
  const ticks = useMemo(() => generateTicks(timeline.dateRange, timeline.totalDays), [timeline])
  const todayPos = timeline.totalDays > 0 ? (diffDays(timeline.dateRange.start, todayStr) / timeline.totalDays) * 100 : -1
  const fileColorMap = useMemo(() => buildFileColorMap(allTasks || []), [allTasks])

  // Helper to get file color for a client
  const getFileColorForClient = (client) => {
    const key = client.spreadsheetId || client.month || "unknown"
    return fileColorMap[key] || null
  }

  return (
    <div className="mb-6">
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-purple-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-purple-400">Project Timeline</h2>
          <span className="ml-2 text-[10px] text-purple-300">
            {timeline.clients.length} clients · {allTasks.length} tasks
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-purple-300">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-5 rounded-sm bg-purple-500" />
            <span>Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-5 rounded-sm bg-purple-200 opacity-60" />
            <span>Done</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-5 rounded-sm bg-purple-500 ring-1 ring-red-300" />
            <span>Overdue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-px bg-purple-500" />
            <span>Today</span>
          </div>
        </div>
      </div>

      {/* Date ruler */}
      <DateRuler ticks={ticks} todayPos={todayPos} />

      {/* Client cards — active first, then completed */}
      <div className="space-y-3">
        {timeline.clients
          .filter((c) => Math.round((c.stats.done / c.stats.total) * 100) < 100)
          .map((client, idx) => (
            <div key={client.name} className="animate-magic-enter" style={{ animationDelay: `${Math.min(idx, 10) * 80}ms` }}>
            <ClientCard
              client={client}
              colorIndex={idx}
              dateRange={timeline.dateRange}
              totalDays={timeline.totalDays}
              ticks={ticks}
              todayPos={todayPos}
              fileColor={getFileColorForClient(client)}
              assignments={assignments}
              onUpdateAssignment={onUpdateAssignment}
            />
            </div>
          ))}
      </div>

      {/* Completed clients */}
      {timeline.clients.some((c) => Math.round((c.stats.done / c.stats.total) * 100) >= 100) && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xs font-bold uppercase tracking-widest text-green-500">Completed</h3>
            <span className="text-[10px] text-green-400">
              {timeline.clients.filter((c) => Math.round((c.stats.done / c.stats.total) * 100) >= 100).length} clients
            </span>
          </div>
          <div className="space-y-2">
            {timeline.clients
              .filter((c) => Math.round((c.stats.done / c.stats.total) * 100) >= 100)
              .map((client, idx) => (
                <CompletedCard key={client.name} client={client} colorIndex={idx} fileColor={getFileColorForClient(client)} />
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
