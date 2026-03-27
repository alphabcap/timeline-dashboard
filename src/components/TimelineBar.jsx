import { useState } from "react"

// ─── Color palette (rotating per client index) ──────────────────────────────

const CLIENT_COLORS = [
  { bar: "bg-purple-500", light: "bg-purple-200", text: "text-purple-900", border: "border-purple-600" },
  { bar: "bg-blue-500",   light: "bg-blue-200",   text: "text-blue-900",   border: "border-blue-600"   },
  { bar: "bg-teal-500",   light: "bg-teal-200",   text: "text-teal-900",   border: "border-teal-600"   },
  { bar: "bg-amber-500",  light: "bg-amber-200",  text: "text-amber-900",  border: "border-amber-600"  },
  { bar: "bg-rose-500",   light: "bg-rose-200",    text: "text-rose-900",   border: "border-rose-600"   },
  { bar: "bg-indigo-500", light: "bg-indigo-200", text: "text-indigo-900", border: "border-indigo-600" },
]

export function getClientColor(index) {
  return CLIENT_COLORS[index % CLIENT_COLORS.length]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function diffDays(dateA, dateB) {
  const a = new Date(dateA); a.setHours(0, 0, 0, 0)
  const b = new Date(dateB); b.setHours(0, 0, 0, 0)
  return Math.round((b - a) / 86_400_000)
}

function fmtDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function daysFromToday(dueDate) {
  if (!dueDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0)
  return Math.floor((due - today) / 86_400_000)
}

// ─── TimelineBar ─────────────────────────────────────────────────────────────

export default function TimelineBar({ task, rangeStart, dayWidth, colorIndex, rowIndex }) {
  const [hovered, setHovered] = useState(false)
  const color = getClientColor(colorIndex)

  const barStart = task.startDate || task.dueDate
  const leftDays = diffDays(rangeStart, barStart)
  const spanDays = diffDays(barStart, task.dueDate)

  const leftPx = leftDays * dayWidth
  // Minimum 2-day width so even the first task (start=due) is clearly visible
  const minWidth = dayWidth * 2
  const widthPx = Math.max(spanDays * dayWidth, minWidth)

  const isOverdue = !task.done && daysFromToday(task.dueDate) < 0
  const days = daysFromToday(task.dueDate)

  const barHeight = 28
  const barGap = 4
  const topPx = rowIndex * (barHeight + barGap)

  return (
    <div
      className="absolute group"
      style={{ left: `${leftPx}px`, width: `${widthPx}px`, top: `${topPx}px`, height: `${barHeight}px` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Bar */}
      <div
        className={`h-full rounded-md shadow-sm transition-all duration-150 border
          ${task.done
            ? `${color.light} border-transparent opacity-70`
            : isOverdue
              ? `${color.bar} border-red-400 ring-1 ring-red-300/50`
              : `${color.bar} ${color.border} border-transparent`
          }
          ${hovered ? "shadow-md scale-y-110 brightness-110 z-20" : "z-10"}
        `}
        style={{ minWidth: "12px" }}
      >
        {/* Bar label (only if wide enough) */}
        {widthPx > 80 && (
          <div className="flex h-full items-center px-2 overflow-hidden">
            <span className={`truncate text-[10px] font-semibold ${task.done ? "text-gray-500 line-through" : "text-white"}`}>
              {task.topic}
            </span>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute z-50 w-64 rounded-xl border border-purple-100 bg-white p-3 shadow-xl shadow-purple-100/50"
          style={{
            bottom: `${barHeight + 8}px`,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          {/* Arrow */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 border-b border-r border-purple-100 bg-white" />

          <p className={`text-sm font-semibold text-gray-800 leading-snug ${task.done ? "line-through text-gray-400" : ""}`}>
            {task.topic}
          </p>
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-purple-400 w-16 shrink-0">Client</span>
              <span className="text-gray-600">{task.clientName}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-purple-400 w-16 shrink-0">Team</span>
              <span className="text-gray-600">{task.responsibility || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-purple-400 w-16 shrink-0">Due</span>
              <span className="text-gray-600">{fmtDate(task.dueDate)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-purple-400 w-16 shrink-0">Month</span>
              <span className="text-gray-600">{task.month || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-purple-400 w-16 shrink-0">Status</span>
              {task.done ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Done</span>
              ) : isOverdue ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">{days} days</span>
              ) : days === 0 ? (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-600">Today</span>
              ) : (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-600">+{days} days</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
