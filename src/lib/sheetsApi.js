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

  for (const sheet of sheetList) {
    const spreadsheetId = parseSheetId(sheet.url)

    if (!spreadsheetId) {
      console.warn(`[sheetsApi] Cannot parse spreadsheet ID from: ${sheet.url}`)
      continue
    }

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

    // 2️⃣  Per tab: fetch rows A2:D
    //   UNFORMATTED_VALUE → booleans = true/false, dates = serial number
    for (const tab of meta.sheets) {
      const tabTitle = tab.properties.title
      const range    = encodeURIComponent(`${tabTitle}!A2:D`)
      const url      = `${BASE_URL}/${spreadsheetId}/values/${range}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`

      const dataRes = await fetch(url)
      const data    = await dataRes.json()

      if (data.error) {
        console.warn(`[sheetsApi] Could not read tab "${tabTitle}":`, data.error.message)
        continue
      }

      for (const row of data.values ?? []) {
        // A=status(bool)  B=topic  C=responsibility  D=dueDate
        const [statusRaw, topic, responsibility, dueDateRaw] = row

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
          topic:          topic.toString().trim(),
          responsibility: (responsibility ?? "").toString().trim(),
          dueDate:        parsedDate,
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
    if (!clientStats[t.clientName]) clientStats[t.clientName] = { total: 0, done: 0 }
    clientStats[t.clientName].total++
    if (t.done) clientStats[t.clientName].done++
  })

  // Drop rows that have no due date
  const withDate = tasks.filter((t) => t.dueDate)

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

  return { overdue, upcoming, clientStats }
}
