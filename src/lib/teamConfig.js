// ─── Team Member Configuration ────────────────────────────────────────────────
//
// ข้อมูลสมาชิกเก็บใน localStorage (แก้ไขจากหน้าเว็บได้)
// ROLE_CONFIG เป็น static — แก้ที่นี่ถ้าต้องการเพิ่ม role ใหม่
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MEMBERS = [
  { name: "Tony",  role: "creative", avatar: "" },
  { name: "RK",    role: "creative", avatar: "" },
  { name: "Pleng", role: "ae",       avatar: "" },
  { name: "Aom",   role: "ae",       avatar: "" },
  { name: "Boom",  role: "pm",       avatar: "" },
  { name: "Point", role: "pm",       avatar: "" },
]

const STORAGE_KEY = "magic-team-members"

/** Load team members from localStorage (or defaults) */
export function loadTeamMembers() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch { /* ignore */ }
  return DEFAULT_MEMBERS
}

/** Save team members to localStorage */
export function saveTeamMembers(members) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(members))
}

// For backward compat — modules that import TEAM_MEMBERS get the live version
export let TEAM_MEMBERS = loadTeamMembers()

/** Refresh the in-memory TEAM_MEMBERS from localStorage */
export function refreshTeamMembers() {
  TEAM_MEMBERS = loadTeamMembers()
  return TEAM_MEMBERS
}

export const ROLES = ["creative", "ae", "media", "pm"]

export const ROLE_CONFIG = {
  creative: {
    sizeClass: "h-16 w-16",   // ใหญ่สุด (+30%)
    smSizeClass: "h-[52px] w-[52px]",
    xsSizeClass: "h-12 w-12",
    textClass: "text-xl",
    smTextClass: "text-base",
    xsTextClass: "text-sm",
    ring: "ring-purple-400",
    bg: "bg-purple-100 text-purple-700",
    label: "Creative",
  },
  ae: {
    sizeClass: "h-[52px] w-[52px]",   // กลาง (+30%)
    smSizeClass: "h-10 w-10",
    xsSizeClass: "h-9 w-9",
    textClass: "text-base",
    smTextClass: "text-sm",
    xsTextClass: "text-xs",
    ring: "ring-blue-400",
    bg: "bg-blue-100 text-blue-700",
    label: "AE",
  },
  media: {
    sizeClass: "h-[52px] w-[52px]",   // กลาง (เท่า AE +30%)
    smSizeClass: "h-10 w-10",
    xsSizeClass: "h-9 w-9",
    textClass: "text-base",
    smTextClass: "text-sm",
    xsTextClass: "text-xs",
    ring: "ring-teal-400",
    bg: "bg-teal-100 text-teal-700",
    label: "Media Buyer",
  },
  pm: {
    sizeClass: "h-10 w-10",     // เล็กสุด (+30%)
    smSizeClass: "h-8 w-8",
    xsSizeClass: "h-7 w-7",
    textClass: "text-sm",
    smTextClass: "text-xs",
    xsTextClass: "text-[10px]",
    ring: "ring-amber-400",
    bg: "bg-amber-100 text-amber-700",
    label: "PM",
  },
}

/**
 * Fuzzy match team members from a responsibility string.
 * Uses the live TEAM_MEMBERS (from localStorage).
 */
export function matchMembers(str) {
  if (!str) return []
  const lower = str.toLowerCase()
  const members = loadTeamMembers()
  const order = { creative: 0, ae: 1, media: 2, pm: 3 }
  return members
    .filter((m) => lower.includes(m.name.toLowerCase()))
    .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9))
}
