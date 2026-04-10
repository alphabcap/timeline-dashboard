// ─── Google Sheets API v4 Utility ─────────────────────────────────────────────
//
// Column order in Google Sheet (per tab):
//   A = Status     (TRUE = done ✓ / FALSE = not done ✗)
//   B = Topic      (Content / Topic)
//   C = Responsibility
//   D = Due Date   (date cell)
//
// Each tab name  = Client Name   (e.g. "Nike TH", "PTT Exploration")
// Spreadsheet title → Month label (parsed from the sheet name itself):
//   "Magic_Project Timeline Feb 26" → "FEB 26"
//   "MAGIC_Timeline Internal"       → "Internal"
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets"

// ── File Color Palette ─────────────────────────────────────────────────────
// Soft pastel backgrounds for each Google Sheet file. Designed to be
// visually distinct yet harmonious.  Index = order of file appearance.

const FILE_COLORS = [
  { bg: "bg-violet-100/70",  sub: "bg-violet-50/60",  stripe: "border-l-violet-400",  tag: "bg-violet-100 text-violet-700",   label: "violet"  },
  { bg: "bg-sky-100/70",     sub: "bg-sky-50/60",     stripe: "border-l-sky-400",     tag: "bg-sky-100 text-sky-700",          label: "sky"     },
  { bg: "bg-amber-100/70",   sub: "bg-amber-50/60",   stripe: "border-l-amber-400",   tag: "bg-amber-100 text-amber-700",     label: "amber"   },
  { bg: "bg-emerald-100/70", sub: "bg-emerald-50/60", stripe: "border-l-emerald-400", tag: "bg-emerald-100 text-emerald-700",  label: "emerald" },
  { bg: "bg-rose-100/70",    sub: "bg-rose-50/60",    stripe: "border-l-rose-400",    tag: "bg-rose-100 text-rose-700",        label: "rose"    },
  { bg: "bg-cyan-100/70",    sub: "bg-cyan-50/60",    stripe: "border-l-cyan-400",    tag: "bg-cyan-100 text-cyan-700",        label: "cyan"    },
  { bg: "bg-fuchsia-100/70", sub: "bg-fuchsia-50/60", stripe: "border-l-fuchsia-400", tag: "bg-fuchsia-100 text-fuchsia-700",  label: "fuchsia" },
  { bg: "bg-lime-100/70",    sub: "bg-lime-50/60",    stripe: "border-l-lime-400",    tag: "bg-lime-100 text-lime-700",        label: "lime"    },
]

/**
 * Build a map: spreadsheetId → FILE_COLORS entry.
 * Call this once with the full task list.
 */
export function buildFileColorMap(tasks) {
  const map = {}
  let idx = 0
  for (const t of tasks) {
    const key = t.spreadsheetId || t.month || "unknown"
    if (!map[key]) {
      map[key] = FILE_COLORS[idx % FILE_COLORS.length]
      idx++
    }
  }
  return map
}

/** Get file color for a single task. Provide the prebuilt map. */
export function getFileColor(task, colorMap) {
  const key = task.spreadsheetId || task.month || "unknown"
  return colorMap[key] || FILE_COLORS[0]
}

// ── Brand Name Extraction ─────────────────────────────────────────────────────
// Tab names in Google Sheets are messy, e.g.:
//   "(Pleng+Toey) Influ Dr.choice Mar 26 - Apr 26"  → "Dr.choice"
//   "(point+pang)Skyline Pool Villa VDO แก่งกระจาน"   → "Skyline Pool Villa"
//   "(Point+RK)One box main 3 clips Jan 26"          → "One box"
//
// Strategy: auto-clean + allow manual override stored in localStorage.

const BRAND_STORAGE_KEY = "magic-brand-names"

// Noise words to strip (case-insensitive) — common project descriptors
const NOISE_WORDS = [
  "influ", "vdo", "video", "clip", "clips", "main", "photo", "reels", "reel",
  "tiktok", "ig", "fb", "post", "posts", "story", "stories", "kol",
  "campaign", "content", "ads", "ad",
]

// Month patterns
const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d{2,4}(\s*-\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?\s*\d{2,4})?\b/gi

/**
 * Auto-extract brand name from a tab title.
 */
export function extractBrandName(tabTitle) {
  if (!tabTitle) return tabTitle
  let s = tabTitle
  s = s.replace(/^\([^)]*\)\s*/, "")
  s = s.replace(MONTH_RE, "")
  const noiseRe = new RegExp(`\\b(${NOISE_WORDS.join("|")})\\b`, "gi")
  s = s.replace(noiseRe, "")
  s = s.replace(/\s+\d+\s*$/, "")
  s = s.replace(/\s+/g, " ").trim()
  return s || tabTitle.replace(/^\([^)]*\)\s*/, "").trim()
}

/**
 * Brand List — confirmed client brands stored in localStorage.
 *
 * Structure: {
 *   confirmedBrands: {
 *     "brandName": { tabs: ["raw tab 1", "raw tab 2"] }
 *   }
 * }
 *
 * - confirmed = user has reviewed & accepted this brand name
 * - tabs = which raw Google Sheet tab names map to this brand
 * - new tabs that don't match any confirmed brand → shown as "new"
 */

export function loadBrandList() {
  try {
    const stored = localStorage.getItem(BRAND_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.confirmedBrands) return parsed
    }
  } catch { /* ignore */ }
  return { confirmedBrands: {} }
}

export function saveBrandList(list) {
  localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(list))
}

/**
 * Given all current tab names from synced data, compute:
 * - confirmed: brands the user has already confirmed (with merged tabs)
 * - newTabs: tabs that don't match any confirmed brand (need review)
 * - tabToBrand: lookup map for resolving any tab → brand name
 */
export function computeBrandStatus(allTabNames) {
  const list = loadBrandList()
  const confirmed = list.confirmedBrands // { brandName: { tabs: [...] } }

  // Build set of all tabs that are already mapped to a confirmed brand
  const mappedTabs = new Set()
  Object.values(confirmed).forEach((b) => {
    b.tabs.forEach((t) => mappedTabs.add(t))
  })

  // Find new (unmapped) tabs
  const newTabs = allTabNames.filter((t) => !mappedTabs.has(t))

  // Build tabToBrand lookup
  const tabToBrand = {}
  Object.entries(confirmed).forEach(([brand, b]) => {
    b.tabs.forEach((t) => { tabToBrand[t] = brand })
  })
  // New tabs get auto-extracted name (but not confirmed yet)
  newTabs.forEach((t) => {
    tabToBrand[t] = extractBrandName(t)
  })

  return { confirmed, newTabs, tabToBrand }
}

/** Confirm a brand: assign a name and map tabs to it */
export function confirmBrand(brandName, tabs) {
  const list = loadBrandList()
  // Remove these tabs from any other brand first
  Object.values(list.confirmedBrands).forEach((b) => {
    b.tabs = b.tabs.filter((t) => !tabs.includes(t))
  })
  // Clean up empty brands
  Object.keys(list.confirmedBrands).forEach((k) => {
    if (list.confirmedBrands[k].tabs.length === 0) delete list.confirmedBrands[k]
  })
  // Add/update brand
  if (!list.confirmedBrands[brandName]) {
    list.confirmedBrands[brandName] = { tabs: [...tabs] }
  } else {
    const existing = new Set(list.confirmedBrands[brandName].tabs)
    tabs.forEach((t) => existing.add(t))
    list.confirmedBrands[brandName].tabs = [...existing]
  }
  saveBrandList(list)
}

/** Rename an existing confirmed brand */
export function renameBrand(oldName, newName) {
  const list = loadBrandList()
  if (!list.confirmedBrands[oldName]) return
  const data = list.confirmedBrands[oldName]
  delete list.confirmedBrands[oldName]
  list.confirmedBrands[newName] = data
  saveBrandList(list)
}

/** Remove a confirmed brand (tabs become "new" again) */
export function removeBrand(brandName) {
  const list = loadBrandList()
  delete list.confirmedBrands[brandName]
  saveBrandList(list)
}

// ── Legacy compat (used by DashboardView) ──
export function loadBrandMap() {
  const list = loadBrandList()
  const map = {}
  Object.entries(list.confirmedBrands).forEach(([brand, b]) => {
    b.tabs.forEach((t) => { map[t] = brand })
  })
  return map
}
export function saveBrandMap() {} // no-op, use confirmBrand/renameBrand instead
export function resolveBrandName(tabTitle) {
  const map = loadBrandMap()
  if (map[tabTitle]) return map[tabTitle]
  return extractBrandName(tabTitle)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract spreadsheet ID from any Google Sheets URL */
export function parseSheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/**
 * Convert Google Sheets date serial number → ISO string (YYYY-MM-DD)
 * Sheets epoch = Dec 30 1899; Unix epoch offset = 25569 days
 */
function serialToISO(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().split("T")[0]
}

/**
 * Robustly parse a date value that comes from Google Sheets.
 * With UNFORMATTED_VALUE: date cells → number (serial), text → string
 */
function parseDueDate(raw) {
  if (raw === null || raw === undefined || raw === "") return ""

  // Serial number (most reliable — comes from UNFORMATTED_VALUE)
  if (typeof raw === "number") return serialToISO(raw)

  const str = String(raw).trim()
  if (!str) return ""

  // ISO format  e.g. "2026-04-01"
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str

  // MM/DD/YYYY  e.g. "4/1/2026"
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) {
    const [, m, d, y] = mdy
    return new Date(+y, +m - 1, +d).toISOString().split("T")[0]
  }

  // DD/MM/YYYY  e.g. "01/04/2026"
  const dmy = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return new Date(+y, +m - 1, +d).toISOString().split("T")[0]
  }

  // Fallback: let Date parse it (handles "April 1, 2026" etc.)
  const fallback = new Date(str)
  if (!isNaN(fallback.getTime())) return fallback.toISOString().split("T")[0]

  return str // last resort: return as-is
}

/**
 * Parse the month label from the Google Spreadsheet title.
 *
 * Rules (applied to the segment after the last "_"):
 *   - Last token is "internal" (case-insensitive) → "Internal"
 *   - Otherwise take the last two tokens and UPPERCASE them → e.g. "FEB 26"
 *   - If only one token, uppercase it → e.g. "MAR"
 *
 * Examples:
 *   "Magic_Project Timeline Feb 26"  → "FEB 26"
 *   "MAGIC_Timeline Internal"        → "Internal"
 *   "MAGIC_MAR"                      → "MAR"
 */
function monthFromTitle(title) {
  if (!title) return ""

  // Take the part after the last underscore (or the whole title if no underscore)
  const underscoreIdx = title.lastIndexOf("_")
  const suffix = (underscoreIdx >= 0 ? title.slice(underscoreIdx + 1) : title).trim()

  const tokens = suffix.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ""

  const lastToken = tokens[tokens.length - 1]

  // "Internal" check
  if (lastToken.toLowerCase() === "internal") return "Internal"

  // Two-token month+year pattern (e.g. "Feb 26")
  if (tokens.length >= 2) {
    return tokens.slice(-2).join(" ").toUpperCase()
  }

  // Single token (e.g. "MAR")
  return lastToken.toUpperCase()
}

// ── Main Fetcher ──────────────────────────────────────────────────────────────

/**
 * Fetch all tasks from every connected Google Sheet.
 * @param {Array<{id: number, url: string}>} sheetList
 * @returns {Promise<Array>} flat array of task objects
 */
export async function fetchAllSheetsData(sheetList) {
  const apiKey = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY

  if (!apiKey || apiKey === "your_api_key_here") {
    throw new Error(
      "Missing API key — open .env and set VITE_GOOGLE_SHEETS_API_KEY, then restart the dev server."
    )
  }

  const allTasks = []
  let nextId = 1
  const seenTabs = new Set()          // deduplicate same tab name across spreadsheets
  const seenSpreadsheets = new Set()  // deduplicate same spreadsheet fetched twice

  for (const sheet of sheetList) {
    const spreadsheetId = parseSheetId(sheet.url)

    if (!spreadsheetId) {
      console.warn(`[sheetsApi] Cannot parse spreadsheet ID from: ${sheet.url}`)
      continue
    }

    // Skip if we already fetched this spreadsheet (e.g. duplicate URL in list)
    if (seenSpreadsheets.has(spreadsheetId)) continue
    seenSpreadsheets.add(spreadsheetId)

    // 1️⃣  Spreadsheet metadata → get title + all tab names
    const metaRes = await fetch(`${BASE_URL}/${spreadsheetId}?key=${apiKey}`)
    const meta    = await metaRes.json()

    if (meta.error) {
      throw new Error(
        `Google Sheets API error: ${meta.error.message} (code ${meta.error.code})`
      )
    }

    // Derive the month label once from the spreadsheet title (shared by all tasks in this sheet)
    const spreadsheetTitle = meta.properties?.title ?? ""
    const monthLabel       = monthFromTitle(spreadsheetTitle)

    // 2️⃣  Batch-fetch ALL tabs in one API call (instead of N separate calls)
    //   UNFORMATTED_VALUE → booleans = true/false, dates = serial number
    // Build tab metadata — skip hidden tabs (ghost copies across spreadsheets)
    const tabInfos = meta.sheets
      .filter((t) => !t.properties.hidden)
      .map((t) => ({
        title: t.properties.title,
        gid:   t.properties.sheetId,
      }))
    const tabNames = tabInfos.map((t) => t.title)

    // gidMap: tab title → gid (exact + trimmed keys for robust lookup)
    const gidMap = new Map()
    for (const info of tabInfos) {
      gidMap.set(info.title, info.gid)
      gidMap.set(info.title.trim(), info.gid)
    }

    const ranges = tabNames.map((t) => `ranges=${encodeURIComponent(`${t}!A2:E`)}`).join("&")
    const batchUrl = `${BASE_URL}/${spreadsheetId}/values:batchGet?${ranges}&key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`

    const batchRes = await fetch(batchUrl)
    const batchData = await batchRes.json()

    if (batchData.error) {
      console.warn(`[sheetsApi] batchGet error for "${spreadsheetTitle}":`, batchData.error.message)
      continue
    }

    for (const valueRange of batchData.valueRanges ?? []) {
      // Parse tab name from the response range string (authoritative source)
      // e.g. "'(Point+RK)One box main 3 clips Jan 26'!A2:E50" → "(Point+RK)One box main 3 clips Jan 26"
      const rangeStr = valueRange.range || ""
      let parsedTab = rangeStr.replace(/!.*$/, "")
      if (parsedTab.startsWith("'") && parsedTab.endsWith("'")) {
        parsedTab = parsedTab.slice(1, -1).replace(/''/g, "'")
      }

      const tabTitle = parsedTab
      // Look up gid from metadata: exact → trimmed → NFC-normalized fallback
      let tabGid = gidMap.get(tabTitle)
      if (tabGid === undefined) tabGid = gidMap.get(tabTitle.trim())
      if (tabGid === undefined) {
        const norm = tabTitle.normalize("NFC").trim()
        const match = tabInfos.find((t) => t.title.normalize("NFC").trim() === norm)
        tabGid = match?.gid ?? 0
      }

      // Skip duplicate tab names already seen from another spreadsheet
      if (seenTabs.has(tabTitle)) continue
      seenTabs.add(tabTitle)

      for (const [rowIdx, row] of (valueRange.values ?? []).entries()) {
        // A=status(bool)  B=topic  C=responsibility  D=dueDate  E=actualSubmit
        const [statusRaw, topic, responsibility, dueDateRaw, actualSubmitRaw] = row

        if (!topic?.toString().trim()) continue   // skip blank rows

        const done =
          statusRaw === true ||
          statusRaw === 1 ||
          String(statusRaw).toLowerCase() === "true"

        const parsedDate = parseDueDate(dueDateRaw)

        allTasks.push({
          id:             nextId++,
          clientName:     tabTitle,
          done,
          month:          monthLabel,
          spreadsheetId,
          topic:          topic.toString().trim(),
          responsibility: (responsibility ?? "").toString().trim(),
          dueDate:        parsedDate,
          rowIndex:       rowIdx + 2,  // +2: range starts at row 2 (row 1 = header)
          actualSubmit:   parseDueDate(actualSubmitRaw),
          sheetGid:       tabGid,
        })
      }
    }
  }

  return allTasks
}

// ── Categorizer ───────────────────────────────────────────────────────────────

/**
 * Split flat task array into overdue vs upcoming.
 *
 * Rules:
 *  - Tasks with no due date → excluded from ALL lists
 *  - Overdue  : not done + due date is in the past
 *  - Upcoming : not done + due date is 0–10 days from today (inclusive)
 *  - Tasks due > 10 days away → not shown anywhere
 */
export function categorizeTasks(tasks) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Per-client progress stats — count ALL tasks that have a topic
  const clientStats = {}
  tasks.forEach((t) => {
    if (!String(t.topic || "").trim()) return
    const statsKey = `${t.clientName}::${t.spreadsheetId}`
    if (!clientStats[statsKey]) clientStats[statsKey] = { total: 0, done: 0 }
    clientStats[statsKey].total++
    if (t.done) clientStats[statsKey].done++
  })

  // Drop rows that have no valid due date
  const withDate = tasks.filter((t) => {
    if (!t.dueDate) return false
    const d = new Date(t.dueDate)
    return !isNaN(d.getTime())
  })

  const overdue = withDate
    .filter((t) => !t.done && new Date(t.dueDate) < today)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)) // oldest (most overdue) first

  const upcoming = withDate
    .filter((t) => {
      if (t.done) return false
      const daysLeft = Math.floor((new Date(t.dueDate) - today) / 86_400_000)
      return daysLeft >= 0 && daysLeft <= 10
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)) // soonest (today) first

  return { overdue, upcoming, clientStats, allTasks: withDate }
}

// ── Timeline Data Preparation ────────────────────────────────────────────────

/**
 * Prepare data for the Monday.com-style Timeline view.
 *
 * For each client (tab), the "start date" is the earliest dueDate in that group.
 * Each task's bar spans from client startDate → task's own dueDate.
 *
 * @param {Array} allTasks — tasks with valid dueDates (from categorizeTasks)
 * @returns {{ clients: Array, dateRange: { start: string, end: string }, totalDays: number }}
 */
export function prepareTimelineData(allTasks) {
  if (!allTasks || allTasks.length === 0) {
    return { clients: [], dateRange: { start: "", end: "" }, totalDays: 0 }
  }

  // Filter to only valid dates, then group by clientName
  const validTasks = allTasks.filter((t) => {
    if (!t.dueDate) return false
    const d = new Date(t.dueDate)
    return !isNaN(d.getTime())
  })

  if (validTasks.length === 0) {
    return { clients: [], dateRange: { start: "", end: "" }, totalDays: 0 }
  }

  const groups = {}
  validTasks.forEach((t) => {
    const key = `${t.clientName}::${t.spreadsheetId}`
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  })

  // Per-client stats
  const clientStats = {}
  validTasks.forEach((t) => {
    const statsKey = `${t.clientName}::${t.spreadsheetId}`
    if (!clientStats[statsKey]) clientStats[statsKey] = { total: 0, done: 0 }
    clientStats[statsKey].total++
    if (t.done) clientStats[statsKey].done++
  })

  let globalMin = null
  let globalMax = null

  const clients = Object.entries(groups)
    .map(([groupKey, tasks]) => {
      const name = tasks[0]?.clientName || groupKey
      // Sort tasks by dueDate
      tasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))

      const dates = tasks.map((t) => new Date(t.dueDate))
      const earliest = dates[0]
      const latest = dates[dates.length - 1]

      const startDate = earliest.toISOString().split("T")[0]
      const endDate = latest.toISOString().split("T")[0]

      if (!globalMin || earliest < globalMin) globalMin = earliest
      if (!globalMax || latest > globalMax) globalMax = latest

      return {
        name,
        startDate,
        endDate,
        spreadsheetId: tasks[0]?.spreadsheetId || "",
        month: tasks[0]?.month || "",
        stats: clientStats[groupKey] || { total: 0, done: 0 },
        tasks: tasks.map((t) => ({
          ...t,
          startDate, // client's earliest dueDate
        })),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // Add 5-day padding on each side
  const padStart = new Date(globalMin)
  padStart.setDate(padStart.getDate() - 5)
  const padEnd = new Date(globalMax)
  padEnd.setDate(padEnd.getDate() + 5)

  const totalDays = Math.ceil((padEnd - padStart) / 86_400_000) + 1

  return {
    clients,
    dateRange: {
      start: padStart.toISOString().split("T")[0],
      end: padEnd.toISOString().split("T")[0],
    },
    totalDays,
  }
}

// ── Task Completion Write-back ────────────────────────────────────────────────

/**
 * Write task completion status back to Google Sheet via Apps Script Web App.
 * Requires VITE_APPS_SCRIPT_URL env var to be set.
 *
 * Updates:
 *   Column A (row rowIndex): TRUE / FALSE
 *   Column E (row rowIndex): actualSubmit date string, or cleared
 */
export async function updateTaskCompletion({ spreadsheetId, tabName, rowIndex, done, actualSubmit }) {
  const scriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL
  if (!scriptUrl) return false
  try {
    const res = await fetch(scriptUrl, {
      method: "POST",
      // text/plain avoids CORS preflight (required for Google Apps Script)
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ spreadsheetId, tabName, rowIndex, done, actualSubmit }),
      redirect: "follow",
    })
    return res.ok
  } catch { return false }
}
