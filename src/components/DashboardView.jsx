import { useMemo, useState, useRef, useEffect, useCallback } from "react"
import { ROLE_CONFIG, ROLES, matchMembers, loadTeamMembers } from "../lib/teamConfig"
import { computeBrandStatus, confirmBrand, renameBrand, removeBrand, extractBrandName } from "../lib/sheetsApi"
import { getClientColor } from "./TimelineBar"
import AssignTeam from "./AssignTeam"

// ─── Count-up Hook ──────────────────────────────────────────────────────────────

function useCountUp(target, duration = 800) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (target === 0) { setVal(0); return }
    const start = performance.now()
    let raf
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setVal(Math.round(eased * target))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function daysFromToday(dueDate) {
  if (!dueDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0)
  return Math.floor((due - today) / (1000 * 60 * 60 * 24))
}

function fmtDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
}

function fmtDayHeader(iso) {
  const d = daysFromToday(iso)
  if (d === 0) return "Today"
  if (d === 1) return "Tomorrow"
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
}

function progressColor(pct) {
  const hue = Math.round(pct * 1.2)
  return `hsl(${hue}, 65%, 46%)`
}

function overdueConfig(absDays) {
  if (absDays >= 15) return { cls: "bg-red-500 text-white", emoji: "💀" }
  if (absDays >= 10) return { cls: "bg-red-300 text-red-900", emoji: "🔥" }
  if (absDays >= 6) return { cls: "bg-red-200 text-red-800", emoji: "😰" }
  if (absDays >= 3) return { cls: "bg-red-100 text-red-700", emoji: "😬" }
  return { cls: "bg-red-50 text-red-500", emoji: "" }
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color, animDelay = 0, glowClass = "" }) {
  const displayVal = useCountUp(typeof value === "number" ? value : 0)
  return (
    <div
      className={`rounded-2xl border ${color.border} ${color.bg} p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 animate-magic-enter ${glowClass}`}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color.iconBg}`}>
          {icon}
        </div>
        <div>
          <div className={`text-2xl font-black tabular-nums ${color.text}`}>{typeof value === "number" ? displayVal : value}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</div>
        </div>
      </div>
      {sub && <div className="mt-2 text-[11px] text-gray-500">{sub}</div>}
    </div>
  )
}

function CompletionRing({ pct }) {
  const animatedPct = useCountUp(Math.round(pct), 1000)
  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-full animate-magic-scale"
      style={{
        background: `conic-gradient(${progressColor(animatedPct)} ${animatedPct * 3.6}deg, #f3e8ff ${animatedPct * 3.6}deg)`,
      }}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[11px] font-black text-purple-700">
        {animatedPct}%
      </div>
    </div>
  )
}

// ── Editable Client Name (inline in health row) ─────────────────────────────

function EditableClientName({ name, rawTabNames, onRename }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)

  const commit = () => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== name) onRename(rawTabNames, trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false) }}
        className="w-full rounded-md border border-purple-300 px-1.5 py-0.5 text-sm font-semibold text-gray-800 outline-none focus:ring-1 focus:ring-purple-400"
      />
    )
  }

  return (
    <span
      className="text-sm font-semibold text-gray-800 truncate block cursor-pointer hover:text-purple-600 transition"
      onClick={() => { setValue(name); setEditing(true) }}
      title="คลิกเพื่อแก้ชื่อแบรนด์"
    >
      {name}
      <svg className="inline-block ml-1 h-2.5 w-2.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </span>
  )
}

// ── Brand Manager Popup ──────────────────────────────────────────────────────

function BrandManager({ confirmed, newTabs, onConfirm, onRename, onRemove, onClose }) {
  const [editingBrand, setEditingBrand] = useState(null)
  const [editValue, setEditValue] = useState("")
  const [newConfirmName, setNewConfirmName] = useState({})
  const [expandedBrand, setExpandedBrand] = useState(null)

  const existingBrands = Object.keys(confirmed)

  const startEdit = (name) => { setEditingBrand(name); setEditValue(name) }
  const commitEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== editingBrand) {
      onRename(editingBrand, trimmed)
    }
    setEditingBrand(null)
  }

  const handleConfirmNew = (tab) => {
    const name = (newConfirmName[tab] || extractBrandName(tab)).trim()
    if (name) onConfirm(name, [tab])
  }

  // Merge new tab into existing confirmed brand
  const handleMerge = (tab, brandName) => {
    onConfirm(brandName, [tab])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-purple-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-purple-100 bg-white px-5 py-4 rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-purple-900">จัดการรายชื่อลูกค้า</h2>
            <p className="text-[11px] text-purple-300">ยืนยัน แก้ชื่อ รวม หรือลบแบรนด์</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-purple-300 transition hover:bg-purple-50 hover:text-purple-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* New / unconfirmed tabs */}
          {newTabs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">ใหม่</span>
                <span className="text-[10px] text-gray-400">{newTabs.length} tabs ยังไม่ได้ยืนยัน</span>
              </div>
              <div className="space-y-2">
                {newTabs.map((tab) => {
                  const suggested = newConfirmName[tab] ?? extractBrandName(tab)
                  return (
                    <div key={tab} className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 space-y-2">
                      <div className="text-[10px] text-gray-400 truncate" title={tab}>Tab: {tab}</div>
                      <div className="flex items-center gap-2">
                        <input
                          value={suggested}
                          onChange={(e) => setNewConfirmName((p) => ({ ...p, [tab]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && handleConfirmNew(tab)}
                          className="flex-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200"
                          placeholder="ชื่อแบรนด์..."
                        />
                        <button
                          onClick={() => handleConfirmNew(tab)}
                          className="shrink-0 rounded-lg bg-purple-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-purple-700 active:scale-95"
                        >
                          ยืนยัน
                        </button>
                      </div>
                      {/* Quick merge buttons — merge into existing confirmed brand */}
                      {existingBrands.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] text-gray-400 shrink-0">รวมเข้า:</span>
                          {existingBrands.map((b) => (
                            <button
                              key={b}
                              onClick={() => handleMerge(tab, b)}
                              className="rounded-full border border-purple-200 bg-white px-2 py-0.5 text-[9px] font-medium text-purple-600 transition hover:bg-purple-100 active:scale-95"
                            >
                              {b}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Confirmed brands */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-md bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">ยืนยันแล้ว</span>
              <span className="text-[10px] text-gray-400">{existingBrands.length} brands</span>
            </div>
            {existingBrands.length === 0 ? (
              <p className="text-[11px] text-gray-300 ml-2">ยังไม่มีแบรนด์ที่ยืนยัน — กด "ยืนยัน" ด้านบน</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(confirmed).map(([brand, data]) => (
                  <div key={brand} className="rounded-xl border border-gray-100 bg-gray-50/50 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2">
                      {editingBrand === brand ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingBrand(null) }}
                          className="flex-1 rounded-md border border-purple-300 px-2 py-0.5 text-sm font-semibold text-gray-800 outline-none focus:ring-1 focus:ring-purple-400"
                        />
                      ) : (
                        <span
                          className="flex-1 text-sm font-semibold text-gray-800 cursor-pointer hover:text-purple-600 truncate"
                          onClick={() => startEdit(brand)}
                          title="คลิกเพื่อแก้ชื่อ"
                        >
                          {brand}
                          <svg className="inline-block ml-1 h-2.5 w-2.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </span>
                      )}
                      {/* Tab count — click to expand */}
                      <button
                        onClick={() => setExpandedBrand(expandedBrand === brand ? null : brand)}
                        className="text-[9px] text-gray-400 shrink-0 rounded px-1.5 py-0.5 hover:bg-purple-50 hover:text-purple-500 transition"
                        title="ดู tabs"
                      >
                        {data.tabs.length} tabs {expandedBrand === brand ? "▲" : "▼"}
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => { if (confirm(`ลบ "${brand}"? (tabs จะกลับเป็น "ใหม่")`)) onRemove(brand) }}
                        className="shrink-0 rounded-md p-1 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                        title="ลบแบรนด์"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    {/* Expanded: show individual tabs */}
                    {expandedBrand === brand && (
                      <div className="border-t border-gray-100 bg-white px-3 py-2 space-y-1">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-gray-300 mb-1">Google Sheet Tabs</div>
                        {data.tabs.map((tab) => (
                          <div key={tab} className="flex items-center gap-2 text-[10px] text-gray-500 py-0.5">
                            <span className="flex-1 truncate" title={tab}>{tab}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ClientHealthRow({ name, rawTabNames, stats, overdueCount, nextTask, assignments, onUpdateAssignment, onRename, animDelay = 0 }) {
  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0
  const barWidth = stats.total > 0 ? (stats.done / stats.total) * 100 : 0

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 transition-all duration-300 hover:shadow-sm hover:border-purple-200 hover:-translate-y-0.5 animate-magic-enter" style={{ animationDelay: `${animDelay}ms` }}>
      {/* Client name — editable */}
      <div className="w-56 shrink-0">
        <EditableClientName name={name} rawTabNames={rawTabNames} onRename={onRename} />
      </div>

      {/* Progress bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${barWidth}%`, backgroundColor: progressColor(pct) }}
            />
          </div>
          <span className="text-[11px] font-bold tabular-nums w-12 text-right" style={{ color: progressColor(pct) }}>
            {pct}%
          </span>
          <span className="text-[10px] text-gray-400 tabular-nums w-10">
            {stats.done}/{stats.total}
          </span>
        </div>
      </div>

      {/* Overdue badge */}
      <div className="w-16 text-center">
        {overdueCount > 0 ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {overdueCount}
          </span>
        ) : (
          <span className="text-[10px] text-green-400 font-medium">✓ OK</span>
        )}
      </div>

      {/* Next deadline */}
      <div className="w-24 text-center">
        {nextTask ? (
          <span className="text-[11px] text-gray-500">
            {fmtDate(nextTask.dueDate)}
            <span className="text-[9px] text-gray-300 ml-1">
              ({daysFromToday(nextTask.dueDate)}d)
            </span>
          </span>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        )}
      </div>

      {/* Team */}
      <div className="w-28 flex justify-end">
        <AssignTeam
          clientName={name}
          assignments={assignments}
          onUpdate={onUpdateAssignment}
          compact
        />
      </div>
    </div>
  )
}

function MemberCard({ member, stats, maxOverdue, animDelay = 0 }) {
  const rc = ROLE_CONFIG[member.role]
  const total = stats.done + stats.pending + stats.overdue
  const isHighOverdue = stats.overdue > 0 && stats.overdue >= maxOverdue

  return (
    <div
      className={`rounded-2xl border bg-white p-4 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 animate-magic-enter ${
        isHighOverdue ? "border-red-200 animate-overdue-glow" : "border-gray-100"
      }`}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div className="flex items-center gap-3 mb-3">
        {/* Avatar */}
        {member.avatar ? (
          <img
            src={member.avatar}
            alt={member.name}
            className={`${rc.smSizeClass} rounded-full object-cover ring-2 ${rc.ring} ring-offset-1`}
          />
        ) : (
          <span className={`${rc.smSizeClass} ${rc.bg} rounded-full ring-2 ${rc.ring} ring-offset-1 flex items-center justify-center font-bold ${rc.smTextClass}`}>
            {member.name[0]?.toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-800 truncate">{member.name}</div>
          <span className={`inline-block rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${rc.bg} text-gray-700`}>
            {rc.label}
          </span>
        </div>
        {total > 0 && (
          <span className="ml-auto text-lg font-black tabular-nums text-gray-300">{total}</span>
        )}
      </div>

      {/* Stacked bar */}
      {total > 0 ? (
        <>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
            {stats.done > 0 && (
              <div
                className="bg-green-400 transition-all duration-500"
                style={{ width: `${(stats.done / total) * 100}%` }}
              />
            )}
            {stats.pending > 0 && (
              <div
                className="bg-purple-300 transition-all duration-500"
                style={{ width: `${(stats.pending / total) * 100}%` }}
              />
            )}
            {stats.overdue > 0 && (
              <div
                className="bg-red-400 transition-all duration-500"
                style={{ width: `${(stats.overdue / total) * 100}%` }}
              />
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] font-medium">
            {stats.done > 0 && <span className="text-green-600">✓ {stats.done} done</span>}
            {stats.pending > 0 && <span className="text-purple-500">{stats.pending} pending</span>}
            {stats.overdue > 0 && <span className="text-red-500">⚠ {stats.overdue} overdue</span>}
          </div>
          {/* Client badges */}
          {stats.clients.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {stats.clients.map((c) => (
                <span key={c} className="rounded-full bg-purple-50 px-2 py-0.5 text-[9px] font-medium text-purple-500">
                  {c}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-[11px] text-gray-300 mt-1">ไม่มีงาน</div>
      )}
    </div>
  )
}

function OverdueItem({ task, brandName, animDelay = 0 }) {
  const days = daysFromToday(task.dueDate)
  const absDays = Math.abs(days ?? 0)
  const { cls, emoji } = overdueConfig(absDays)

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition hover:bg-red-50/50 animate-magic-enter" style={{ animationDelay: `${animDelay}ms` }}>
      {/* Severity */}
      <span className={`shrink-0 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${cls} ${absDays >= 6 ? "animate-overdue-glow" : "animate-overdue-pulse"}`}>
        {emoji && <span>{emoji}</span>}{days}d
      </span>
      {/* Client */}
      <span className="shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[9px] font-medium text-purple-500 max-w-20 truncate">
        {brandName}
      </span>
      {/* Topic */}
      <span className="text-[11px] text-gray-600 truncate flex-1 min-w-0">{task.topic}</span>
      {/* Person */}
      <span className="text-[10px] text-gray-400 shrink-0 max-w-16 truncate">{task.responsibility}</span>
    </div>
  )
}

function UpcomingDayGroup({ dateKey, tasks, tabToBrand }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[11px] font-bold ${
          daysFromToday(dateKey) === 0 ? "text-orange-500" : daysFromToday(dateKey) === 1 ? "text-amber-500" : "text-gray-500"
        }`}>
          {fmtDayHeader(dateKey)}
        </span>
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-[10px] text-gray-400">{tasks.length} tasks</span>
      </div>
      <div className="space-y-1 ml-1">
        {tasks.map((t) => {
          const d = daysFromToday(t.dueDate)
          const dotColor = d === 0 ? "bg-orange-400" : d <= 2 ? "bg-amber-400" : "bg-green-400"
          return (
            <div key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-purple-50/50">
              <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
              <span className="shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[9px] font-medium text-purple-500 max-w-20 truncate">
                {tabToBrand[t.clientName] || t.clientName}
              </span>
              <span className="text-[11px] text-gray-600 truncate flex-1 min-w-0">{t.topic}</span>
              <span className="text-[10px] text-gray-400 shrink-0">{t.responsibility}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Gantt Timeline ──────────────────────────────────────────────────────────────

const GANTT_COLORS = [
  { bg: "rgb(147,51,234)", light: "rgb(233,213,255)" },   // purple
  { bg: "rgb(59,130,246)", light: "rgb(191,219,254)" },   // blue
  { bg: "rgb(20,184,166)", light: "rgb(153,246,228)" },   // teal
  { bg: "rgb(245,158,11)", light: "rgb(253,230,138)" },   // amber
  { bg: "rgb(244,63,94)",  light: "rgb(254,205,211)" },   // rose
  { bg: "rgb(99,102,241)", light: "rgb(199,210,254)" },   // indigo
  { bg: "rgb(34,197,94)",  light: "rgb(187,247,208)" },   // green
  { bg: "rgb(236,72,153)", light: "rgb(251,207,232)" },   // pink
]

function ganttColor(i) { return GANTT_COLORS[i % GANTT_COLORS.length] }

const ZOOM_LEVELS = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "All", days: 0 },
]

function GanttTimeline({ allTasks, filterMember, teamMembers, assignments }) {
  const scrollRef = useRef(null)
  const containerRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [zoomIdx, setZoomIdx] = useState(1) // default 3M
  const [containerWidth, setContainerWidth] = useState(800)
  const [isDragging, setIsDragging] = useState(false)
  const dragState = useRef({ startX: 0, scrollLeft: 0 })

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Filter tasks by member if selected
  const tasks = useMemo(() => {
    let filtered = allTasks.filter((t) => t.dueDate && !isNaN(new Date(t.dueDate).getTime()))
    if (filterMember) {
      filtered = filtered.filter((t) => {
        const assign = assignments[t.clientName]
        if (assign && Object.values(assign).includes(filterMember)) return true
        const matched = matchMembers(t.responsibility)
        return matched.some((m) => m.name === filterMember)
      })
    }
    return filtered
  }, [allTasks, filterMember, assignments])

  // Group by client + compute layout
  const { clients, markers, dateRange, dayWidth, totalWidth, viewDays } = useMemo(() => {
    if (tasks.length === 0) return { clients: [], markers: [], dateRange: null, dayWidth: 0, totalWidth: 0, viewDays: 0 }

    const groups = {}
    tasks.forEach((t) => {
      if (!groups[t.clientName]) groups[t.clientName] = []
      groups[t.clientName].push(t)
    })

    // Find global date range from data
    const allDates = tasks.map((t) => new Date(t.dueDate))
    const dataMin = new Date(Math.min(...allDates))
    const dataMax = new Date(Math.max(...allDates))

    const zoom = ZOOM_LEVELS[zoomIdx]
    let minDate, maxDate

    if (zoom.days === 0) {
      // "All" — show entire data range with padding
      minDate = new Date(dataMin); minDate.setDate(minDate.getDate() - 7)
      maxDate = new Date(dataMax); maxDate.setDate(maxDate.getDate() + 7)
    } else {
      // Fixed window centered on today
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const halfDays = Math.floor(zoom.days / 2)
      minDate = new Date(today); minDate.setDate(minDate.getDate() - Math.floor(halfDays * 0.4))
      maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + Math.ceil(halfDays * 1.6))
      // Extend to cover data if needed
      if (dataMin < minDate) minDate = new Date(dataMin.getTime() - 7 * 86_400_000)
      if (dataMax > maxDate) maxDate = new Date(dataMax.getTime() + 7 * 86_400_000)
    }

    minDate.setHours(0, 0, 0, 0)
    maxDate.setHours(0, 0, 0, 0)

    const totalDays = Math.ceil((maxDate - minDate) / 86_400_000)
    const LABEL_W = 140
    const availableWidth = containerWidth - LABEL_W

    // Calculate dayWidth: for fixed zoom, fit the zoom.days into the available width
    // For "All", fit everything
    let dw
    if (zoom.days === 0) {
      dw = Math.max(availableWidth / totalDays, 2)
    } else {
      dw = Math.max(availableWidth / zoom.days, 2)
    }

    const tw = totalDays * dw

    // Build time markers (weeks if zoomed in, months if zoomed out)
    const mkrs = []
    const showWeeks = dw >= 4 // show week lines when zoomed in enough

    // Always show month markers
    const monthCursor = new Date(minDate)
    monthCursor.setDate(1)
    while (monthCursor <= maxDate) {
      const ms = new Date(monthCursor)
      const dayOff = Math.max(0, (ms - minDate) / 86_400_000)
      mkrs.push({
        type: "month",
        label: ms.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        left: dayOff * dw,
        date: ms,
      })
      monthCursor.setMonth(monthCursor.getMonth() + 1)
    }

    // Add week markers if zoomed in
    if (showWeeks) {
      const weekCursor = new Date(minDate)
      // Align to Monday
      const dow = weekCursor.getDay()
      weekCursor.setDate(weekCursor.getDate() + (dow === 0 ? 1 : 8 - dow))
      while (weekCursor <= maxDate) {
        const dayOff = (weekCursor - minDate) / 86_400_000
        mkrs.push({
          type: "week",
          label: weekCursor.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
          left: dayOff * dw,
          date: new Date(weekCursor),
        })
        weekCursor.setDate(weekCursor.getDate() + 7)
      }
    }

    // Build client rows
    const clientList = Object.entries(groups)
      .map(([name, clientTasks], idx) => {
        clientTasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
        const earliest = new Date(clientTasks[0].dueDate)
        const latest = new Date(clientTasks[clientTasks.length - 1].dueDate)
        const startOffset = (earliest - minDate) / 86_400_000
        const endOffset = (latest - minDate) / 86_400_000
        const done = clientTasks.filter((t) => t.done).length
        const total = clientTasks.length

        return {
          name, tasks: clientTasks,
          startOffset, endOffset, colorIdx: idx,
          done, total,
          pct: total > 0 ? Math.round((done / total) * 100) : 0,
        }
      })
      .sort((a, b) => a.startOffset - b.startOffset)

    return {
      clients: clientList,
      markers: mkrs,
      dateRange: { min: minDate, max: maxDate },
      dayWidth: dw,
      totalWidth: tw,
      viewDays: zoom.days || totalDays,
    }
  }, [tasks, zoomIdx, containerWidth])

  // Today marker position
  const todayOffset = useMemo(() => {
    if (!dateRange) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const offset = (today - dateRange.min) / 86_400_000
    return offset * dayWidth
  }, [dateRange, dayWidth])

  // Scroll to today on mount or zoom change
  useEffect(() => {
    if (scrollRef.current && todayOffset !== null) {
      const scrollArea = scrollRef.current
      scrollArea.scrollLeft = Math.max(0, todayOffset - scrollArea.clientWidth * 0.35)
    }
  }, [todayOffset, clients.length, zoomIdx])

  // Drag to scroll
  const handleMouseDown = useCallback((e) => {
    if (!scrollRef.current) return
    setIsDragging(true)
    dragState.current = { startX: e.clientX, scrollLeft: scrollRef.current.scrollLeft }
  }, [])
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !scrollRef.current) return
    const dx = e.clientX - dragState.current.startX
    scrollRef.current.scrollLeft = dragState.current.scrollLeft - dx
  }, [isDragging])
  const handleMouseUp = useCallback(() => setIsDragging(false), [])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp) }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  if (tasks.length === 0) {
    return <div className="text-center py-8 text-sm text-gray-300">ไม่มีข้อมูลสำหรับแสดง Timeline</div>
  }

  const ROW_HEIGHT = 32
  const LABEL_WIDTH = 140
  const monthMarkers = markers.filter((m) => m.type === "month")
  const weekMarkers = markers.filter((m) => m.type === "week")

  return (
    <div ref={containerRef}>
      {/* Zoom controls */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mr-1">ช่วงเวลา</span>
        {ZOOM_LEVELS.map((z, i) => (
          <button
            key={z.label}
            onClick={() => setZoomIdx(i)}
            className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${
              zoomIdx === i
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-400 hover:bg-purple-50 hover:text-purple-500"
            }`}
          >
            {z.label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[9px] text-gray-400">← เลื่อน / ลากเพื่อดูช่วงอื่น →</span>
      </div>

      <div className="flex rounded-xl overflow-hidden border border-purple-100 bg-white">
        {/* Fixed left labels */}
        <div className="shrink-0 bg-gray-50/80 border-r border-gray-100 z-10" style={{ width: LABEL_WIDTH }}>
          <div className="h-8 border-b border-gray-100 px-2 flex items-center">
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Client</span>
          </div>
          {weekMarkers.length > 0 && (
            <div className="h-5 border-b border-gray-50" />
          )}
          {clients.map((c) => {
            const color = ganttColor(c.colorIdx)
            return (
              <div
                key={c.name}
                className="flex items-center gap-1.5 px-2 border-b border-gray-50 hover:bg-purple-50/50 transition"
                style={{ height: ROW_HEIGHT }}
              >
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: color.bg }} />
                <span className="text-[10px] font-medium text-gray-700 truncate flex-1" title={c.name}>{c.name}</span>
                <span className="text-[8px] text-gray-400 tabular-nums shrink-0">{c.pct}%</span>
              </div>
            )
          })}
        </div>

        {/* Scrollable timeline area */}
        <div
          ref={scrollRef}
          className={`flex-1 overflow-x-auto overflow-y-hidden ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          onMouseDown={handleMouseDown}
          style={{ scrollBehavior: isDragging ? "auto" : "smooth" }}
        >
          <div className="relative select-none" style={{ width: totalWidth, minWidth: "100%" }}>
            {/* Month headers */}
            <div className="relative h-8 border-b border-gray-100 bg-gray-50/50">
              {monthMarkers.map((m) => (
                <div
                  key={`m-${m.date.getTime()}`}
                  className="absolute top-0 h-full flex items-end pb-0.5 border-l border-gray-200"
                  style={{ left: m.left }}
                >
                  <span className="px-2 text-[9px] font-bold uppercase tracking-wider text-gray-400">{m.label}</span>
                </div>
              ))}
            </div>

            {/* Week sub-headers (if zoomed in) */}
            {weekMarkers.length > 0 && (
              <div className="relative h-5 border-b border-gray-50 bg-gray-50/30">
                {weekMarkers.map((w) => (
                  <div
                    key={`w-${w.date.getTime()}`}
                    className="absolute top-0 h-full flex items-center border-l border-gray-100/60"
                    style={{ left: w.left }}
                  >
                    <span className="px-1 text-[8px] text-gray-400">{w.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Task rows */}
            {clients.map((c) => {
              const color = ganttColor(c.colorIdx)
              const barLeft = c.startOffset * dayWidth
              const barWidth = Math.max((c.endOffset - c.startOffset) * dayWidth, 6)
              const doneWidth = c.total > 0 ? (c.done / c.total) * barWidth : 0

              return (
                <div key={c.name} className="relative border-b border-gray-50" style={{ height: ROW_HEIGHT }}>
                  {/* Grid lines */}
                  {monthMarkers.map((m) => (
                    <div key={`gl-${m.date.getTime()}`} className="absolute top-0 h-full border-l border-gray-100/40" style={{ left: m.left }} />
                  ))}
                  {weekMarkers.map((w) => (
                    <div key={`wl-${w.date.getTime()}`} className="absolute top-0 h-full border-l border-gray-50" style={{ left: w.left }} />
                  ))}

                  {/* Bar */}
                  <div
                    className="absolute top-1.5 rounded-md cursor-pointer transition-opacity hover:opacity-90"
                    style={{ left: barLeft, width: barWidth, height: ROW_HEIGHT - 12, backgroundColor: color.light }}
                    onMouseEnter={(e) => setTooltip({ name: c.name, done: c.done, total: c.total, pct: c.pct, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {doneWidth > 0 && (
                      <div className="h-full rounded-md" style={{ width: doneWidth, backgroundColor: color.bg, opacity: 0.85 }} />
                    )}
                    {barWidth > 60 && (
                      <span
                        className="absolute inset-0 flex items-center pointer-events-none"
                        style={{ paddingLeft: Math.min(doneWidth + 4, barWidth - 20) > 20 ? 0 : undefined }}
                      >
                        <span
                          className="rounded px-1.5 py-px text-[9px] font-bold truncate"
                          style={{
                            backgroundColor: "rgba(255,255,255,0.85)",
                            color: color.bg,
                            marginLeft: 4,
                          }}
                        >
                          {c.name}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Task dots */}
                  {c.tasks.map((t, ti) => {
                    const taskOffset = ((new Date(t.dueDate) - dateRange.min) / 86_400_000) * dayWidth
                    const dotSize = dayWidth >= 4 ? 10 : 8
                    return (
                      <div
                        key={t.id || ti}
                        className="absolute top-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm"
                        style={{
                          left: taskOffset - dotSize / 2,
                          width: dotSize, height: dotSize,
                          backgroundColor: t.done ? color.bg : (new Date(t.dueDate) < new Date() ? "#ef4444" : color.light),
                        }}
                        title={`${t.topic} — ${t.done ? "Done" : "Pending"} (${new Date(t.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })})`}
                      />
                    )
                  })}
                </div>
              )
            })}

            {/* Today line */}
            {todayOffset !== null && todayOffset > 0 && (
              <div
                className="absolute top-0 w-px bg-red-400 z-20 pointer-events-none"
                style={{ left: todayOffset, height: "100%" }}
              >
                <div className="absolute top-0 -translate-x-1/2 rounded-b bg-red-500 px-1.5 py-0.5 text-[7px] font-bold text-white whitespace-nowrap">
                  TODAY
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 rounded-lg bg-gray-900 px-3 py-2 text-white shadow-xl pointer-events-none"
            style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
          >
            <div className="text-xs font-bold">{tooltip.name}</div>
            <div className="text-[10px] text-gray-300 mt-0.5">{tooltip.done}/{tooltip.total} tasks done ({tooltip.pct}%)</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────────

export default function DashboardView({
  allTasks = [],
  allTasksUnfiltered = [],
  overdue = [],
  upcoming = [],
  clientStats = {},
  assignments = {},
  onUpdateAssignment,
  teamMembers = [],
}) {
  const [brandVer, setBrandVer] = useState(0)
  const [showBrandManager, setShowBrandManager] = useState(false)
  const [healthShowAll, setHealthShowAll] = useState(false)
  const HEALTH_PREVIEW_COUNT = 5

  // ── Brand status (confirmed vs new) ──
  const allTabNames = useMemo(() => [...new Set(Object.keys(clientStats).map((k) => k.split("::")[0]))], [clientStats])
  const brandStatus = useMemo(() => computeBrandStatus(allTabNames), [allTabNames, brandVer])

  // ── Brand action handlers ──
  const handleConfirmBrand = (name, tabs) => {
    confirmBrand(name, tabs)
    setBrandVer((v) => v + 1)
  }
  const handleRenameBrand = (oldName, newName) => {
    renameBrand(oldName, newName)
    setBrandVer((v) => v + 1)
  }
  const handleRemoveBrand = (name) => {
    removeBrand(name)
    setBrandVer((v) => v + 1)
  }
  // Inline rename from ClientHealthRow
  const handleInlineRename = (rawTabNames, newName) => {
    confirmBrand(newName, rawTabNames)
    setBrandVer((v) => v + 1)
  }

  // ── Merge clientStats by resolved brand name (dashboard only) ──
  const brandData = useMemo(() => {
    const { confirmed, newTabs, tabToBrand } = brandStatus

    // Group raw tab names → brand name, merge stats
    const brands = {}
    Object.entries(clientStats).forEach(([statsKey, s]) => {
      const tabName = statsKey.split("::")[0]
      const brand = tabToBrand[tabName] || tabName
      if (!brands[brand]) brands[brand] = { total: 0, done: 0, rawTabNames: new Set(), isNew: false }
      brands[brand].total += s.total
      brands[brand].done += s.done
      brands[brand].rawTabNames.add(tabName)
      if (newTabs.includes(tabName)) brands[brand].isNew = true
    })

    return { brands, tabToBrand, confirmed, newTabs }
  }, [clientStats, brandStatus])

  // ── Computed metrics (use filtered allTasks for accurate per-person stats) ──
  const metrics = useMemo(() => {
    const totalAll = allTasks.length
    const totalDone = allTasks.filter((t) => t.done).length
    const completionPct = totalAll > 0 ? (totalDone / totalAll) * 100 : 0
    const activeClientNames = Object.entries(brandData.brands)
      .filter(([, c]) => c.done < c.total)
      .map(([n]) => n)
      .sort((a, b) => a.localeCompare(b, "th"))
    const completedClientNames = Object.entries(brandData.brands)
      .filter(([, c]) => c.done >= c.total && c.total > 0)
      .map(([n]) => n)
      .sort((a, b) => a.localeCompare(b, "th"))
    const dueThisWeek = upcoming.filter((t) => {
      const d = daysFromToday(t.dueDate)
      return d !== null && d >= 0 && d <= 7
    })

    return { totalAll, totalDone, completionPct, activeClientNames, completedClientNames, dueThisWeek }
  }, [allTasks, brandData, upcoming])

  // ── Client health data sorted by risk (raw tab names, not brand-resolved) ──
  const clientHealth = useMemo(() => {
    return Object.entries(clientStats)
      .map(([statsKey, stats]) => {
        const tabName = statsKey.split("::")[0]
        const pct = stats.total > 0 ? (stats.done / stats.total) * 100 : 0
        const spreadsheetId = statsKey.split("::")[1]
        const clientOverdue = overdue.filter((t) => t.clientName === tabName && t.spreadsheetId === spreadsheetId)
        const clientUpcoming = upcoming.filter((t) => t.clientName === tabName && t.spreadsheetId === spreadsheetId)
        const nextTask = clientUpcoming[0] || null
        const risk = clientOverdue.length * 10 + (100 - pct)
        return {
          name: tabName,
          rawTabNames: [tabName],
          stats,
          overdueCount: clientOverdue.length,
          nextTask, risk, pct,
        }
      })
      .filter((c) => c.pct < 100)
      .sort((a, b) => b.risk - a.risk)
  }, [clientStats, overdue, upcoming])

  // ── Team workload ──
  const teamWorkload = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const memberStats = teamMembers.map((member) => {
      // Use unfiltered tasks so Team Workload always shows full picture
      const tasksPool = allTasksUnfiltered.length > 0 ? allTasksUnfiltered : allTasks
      const myTasks = tasksPool.filter((t) => {
        const assign = assignments[t.clientName]
        if (assign) {
          const assignedNames = Object.values(assign)
          if (assignedNames.includes(member.name)) return true
        }
        const matched = matchMembers(t.responsibility)
        return matched.some((m) => m.name === member.name)
      })

      const done = myTasks.filter((t) => t.done).length
      const overdueCount = myTasks.filter((t) => {
        if (t.done) return false
        const due = new Date(t.dueDate); due.setHours(0, 0, 0, 0)
        return due < today
      }).length
      const pending = myTasks.length - done - overdueCount
      const clients = [...new Set(myTasks.map((t) => brandData.tabToBrand[t.clientName] || t.clientName))]

      return { member, stats: { done, pending, overdue: overdueCount, clients } }
    })

    const maxOverdue = Math.max(...memberStats.map((m) => m.stats.overdue), 0)
    return { memberStats, maxOverdue }
  }, [allTasksUnfiltered, allTasks, assignments, teamMembers])

  // ── Upcoming grouped by day (next 7 days) ──
  const upcomingByDay = useMemo(() => {
    const thisWeek = upcoming.filter((t) => {
      const d = daysFromToday(t.dueDate)
      return d !== null && d >= 0 && d <= 7
    })
    const grouped = {}
    thisWeek.forEach((t) => {
      if (!grouped[t.dueDate]) grouped[t.dueDate] = []
      grouped[t.dueDate].push(t)
    })
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
  }, [upcoming])

  return (
    <div className="space-y-6">

      {/* ── ① Summary Stat Cards (top of dashboard) ─────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Overdue"
          value={overdue.length}
          sub={overdue.length > 0 ? `${overdue.length} tasks past deadline` : "All clear!"}
          animDelay={0}
          glowClass={overdue.length > 0 ? "animate-overdue-glow" : ""}
          color={{
            bg: overdue.length > 0 ? "bg-red-50" : "bg-green-50",
            border: overdue.length > 0 ? "border-red-200" : "border-green-200",
            iconBg: overdue.length > 0 ? "bg-red-100" : "bg-green-100",
            text: overdue.length > 0 ? "text-red-600" : "text-green-600",
          }}
          icon={
            <svg className={`h-5 w-5 ${overdue.length > 0 ? "text-red-500" : "text-green-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />

        <StatCard
          label="Due This Week"
          value={metrics.dueThisWeek.length}
          sub="Next 7 days"
          animDelay={80}
          color={{
            bg: "bg-amber-50", border: "border-amber-200",
            iconBg: "bg-amber-100", text: "text-amber-600",
          }}
          icon={
            <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />

        <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 animate-magic-enter" style={{ animationDelay: "160ms" }}>
          <div className="flex items-center gap-3">
            <CompletionRing pct={metrics.completionPct} />
            <div>
              <div className="text-2xl font-black tabular-nums text-purple-700">{Math.round(metrics.completionPct)}%</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Completion</div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">{metrics.totalDone} of {metrics.totalAll} tasks done</div>
        </div>

        <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 animate-magic-enter" style={{ animationDelay: "240ms" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
              <svg className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-black tabular-nums text-purple-700">{metrics.activeClientNames.length}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Active Clients</div>
            </div>
          </div>
          {/* Client name badges: confirmed only, sorted A-Z with numbers */}
          <div className="mt-2.5 flex flex-wrap gap-1">
            {metrics.activeClientNames.map((n, i) => (
              <span key={n} className="rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-medium text-purple-600">
                <span className="text-purple-400">{i + 1}.</span> {n}
              </span>
            ))}
          </div>
          {metrics.completedClientNames.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {metrics.completedClientNames.map((n, i) => (
                <span key={n} className="rounded-full bg-green-50 px-2 py-0.5 text-[9px] font-medium text-green-500 line-through">
                  <span className="text-green-300">{metrics.activeClientNames.length + i + 1}.</span> {n}
                </span>
              ))}
            </div>
          )}
          {/* จัดการ button */}
          <button
            onClick={() => setShowBrandManager(true)}
            className="mt-2 flex items-center gap-1 rounded-lg border border-purple-200 bg-white px-2 py-1 text-[10px] font-semibold text-purple-500 transition hover:bg-purple-50 active:scale-95"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            จัดการรายชื่อ
          </button>
        </div>
      </div>

      {/* ── Gantt Timeline ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-purple-100 bg-white shadow-sm animate-magic-enter" style={{ animationDelay: "100ms" }}>
        <div className="px-5 py-4 border-b border-purple-50">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400">Timeline Overview</h3>
          </div>
        </div>
        <div className="p-3 relative">
          <GanttTimeline
            allTasks={allTasks}
            filterMember={null}
            teamMembers={teamMembers}
            assignments={assignments}
          />
        </div>
      </div>

      {/* ── ② Client Health + ③ Overdue ──────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Client Health Table — show worst first, expandable */}
        <div className="xl:col-span-2 rounded-2xl border border-purple-100 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-purple-50">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-400" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400">Client Health</h3>
              <span className="text-[10px] text-gray-400 ml-1">{clientHealth.length} active</span>
            </div>
          </div>
          <div className="p-3 space-y-1.5">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-400">
              <div className="w-56 shrink-0">Client</div>
              <div className="flex-1">Progress</div>
              <div className="w-16 text-center">Overdue</div>
              <div className="w-24 text-center">Next Due</div>
              <div className="w-28 text-right">Team</div>
            </div>
            {clientHealth.length > 0 ? (
              <>
                {(healthShowAll ? clientHealth : clientHealth.slice(0, HEALTH_PREVIEW_COUNT)).map((c, hi) => (
                  <ClientHealthRow
                    key={c.name}
                    animDelay={Math.min(hi, 10) * 60}
                    name={c.name}
                    rawTabNames={c.rawTabNames}
                    stats={c.stats}
                    overdueCount={c.overdueCount}
                    nextTask={c.nextTask}
                    assignments={assignments}
                    onUpdateAssignment={onUpdateAssignment}
                    onRename={handleInlineRename}
                  />
                ))}
                {clientHealth.length > HEALTH_PREVIEW_COUNT && (
                  <button
                    onClick={() => setHealthShowAll((v) => !v)}
                    className="w-full rounded-xl border border-purple-100 py-2 text-[11px] font-semibold text-purple-400 transition hover:bg-purple-50 active:scale-[0.99]"
                  >
                    {healthShowAll
                      ? "ย่อ"
                      : `แสดงทั้งหมด (+${clientHealth.length - HEALTH_PREVIEW_COUNT} clients)`
                    }
                  </button>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-sm text-gray-300">ไม่มี active clients</div>
            )}
          </div>
        </div>

        {/* Overdue Urgent List */}
        <div className={`rounded-2xl border border-red-100 bg-white shadow-sm ${overdue.length > 0 ? "animate-overdue-glow" : ""}`}>
          <div className="px-5 py-4 border-b border-red-50">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full bg-red-400 ${overdue.length > 0 ? "animate-overdue-pulse" : ""}`} />
              <h3 className="text-xs font-bold uppercase tracking-widest text-red-400">Overdue</h3>
              {overdue.length > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">{overdue.length}</span>
              )}
            </div>
          </div>
          <div className="p-2">
            {overdue.length > 0 ? (
              <div className="space-y-0.5">
                {overdue.slice(0, 10).map((t, oi) => (
                  <OverdueItem key={t.id} task={t} brandName={brandData.tabToBrand[t.clientName] || t.clientName} animDelay={oi * 50} />
                ))}
                {overdue.length > 10 && (
                  <div className="text-center py-2 text-[10px] text-gray-400">
                    +{overdue.length - 10} more overdue tasks
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <span className="text-2xl">🎉</span>
                <div className="mt-1 text-sm text-gray-400">No overdue tasks!</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ④ Team Workload ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-purple-100 bg-white shadow-sm">
        <div className="px-5 py-4 border-b border-purple-50">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400">Team Workload</h3>
            <span className="text-[10px] text-gray-400 ml-1">{teamMembers.length} members</span>
          </div>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {teamWorkload.memberStats.map(({ member, stats }, mi) => (
            <MemberCard
              key={member.name}
              member={member}
              stats={stats}
              maxOverdue={teamWorkload.maxOverdue}
              animDelay={mi * 80}
            />
          ))}
        </div>
        {/* Legend */}
        <div className="px-5 pb-4 flex items-center gap-4 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400" /> Done</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-300" /> Pending</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Overdue</span>
        </div>
      </div>

      {/* ── ⑤ Upcoming This Week ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-purple-100 bg-white shadow-sm">
        <div className="px-5 py-4 border-b border-purple-50">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400">Upcoming This Week</h3>
            <span className="text-[10px] text-gray-400 ml-1">{metrics.dueThisWeek.length} tasks</span>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {upcomingByDay.length > 0 ? (
            upcomingByDay.map(([dateKey, tasks], di) => (
              <div key={dateKey} className="animate-magic-enter" style={{ animationDelay: `${di * 60}ms` }}>
                <UpcomingDayGroup dateKey={dateKey} tasks={tasks} tabToBrand={brandData.tabToBrand} />
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-sm text-gray-300">ไม่มีงานในสัปดาห์นี้</div>
          )}
        </div>
      </div>

      {/* ── Brand Manager Modal ─────────────────────────────────────── */}
      {showBrandManager && (
        <BrandManager
          confirmed={brandData.confirmed}
          newTabs={brandData.newTabs}
          onConfirm={handleConfirmBrand}
          onRename={handleRenameBrand}
          onRemove={handleRemoveBrand}
          onClose={() => setShowBrandManager(false)}
        />
      )}
    </div>
  )
}
