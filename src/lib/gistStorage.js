// ── GitHub Gist as shared "server" storage ────────────────────────────────────
// Stores team members JSON (names + base64 avatars) in a GitHub Gist so all
// users see the same data. Reads are unauthenticated-friendly; writes need a
// GitHub PAT with "gist" scope.
//
// Required env vars (in .env):
//   VITE_GIST_ID=<gist_id from the URL>
//   VITE_GITHUB_TOKEN=<ghp_... PAT with gist scope>

const GIST_ID      = import.meta.env.VITE_GIST_ID
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN
const TEAM_FILE    = "magic-team.json"
const ASSIGN_FILE  = "magic-assignments.json"
const REMARKS_FILE = "magic-remarks.json"
const API_BASE     = "https://api.github.com/gists"

function authHeaders() {
  const h = { Accept: "application/vnd.github+json" }
  if (GITHUB_TOKEN) h["Authorization"] = `Bearer ${GITHUB_TOKEN}`
  return h
}

// ── Write Queue ──────────────────────────────────────────────────────────────
// Serialize all Gist writes so concurrent saves don't race each other.
// Each write waits for the previous one to finish before starting.

let _writeQueue = Promise.resolve()

function enqueueWrite(fn) {
  _writeQueue = _writeQueue.then(fn, fn)  // run fn regardless of prior success/failure
  return _writeQueue
}

// ── Core Read / Write ────────────────────────────────────────────────────────

/** Read a single file from the Gist. Returns parsed JSON or null. */
async function readGistFile(filename) {
  if (!GIST_ID) return null
  try {
    const res = await fetch(`${API_BASE}/${GIST_ID}`, { headers: authHeaders() })
    if (!res.ok) return null
    const gist = await res.json()
    const content = gist.files?.[filename]?.content
    if (!content) return null
    return JSON.parse(content)
  } catch { return null }
}

/**
 * Write one or more files to the Gist (queued + retry).
 * Returns true on success, throws on final failure.
 */
async function writeGistFiles(files) {
  if (!GIST_ID || !GITHUB_TOKEN) return false

  return enqueueWrite(async () => {
    const body = { files: {} }
    for (const [name, data] of Object.entries(files)) {
      body.files[name] = { content: JSON.stringify(data) }
    }

    // Retry up to 2 times on failure
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${API_BASE}/${GIST_ID}`, {
          method: "PATCH",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (res.ok) return true
        // Rate limit → wait and retry
        if (res.status === 429 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
          continue
        }
        console.warn(`[Gist] Write failed: ${res.status} ${res.statusText}`)
        return false
      } catch (err) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
          continue
        }
        console.warn("[Gist] Write failed after retries:", err)
        return false
      }
    }
    return false
  })
}

// ── Team members ─────────────────────────────────────────────────────────────

export async function loadTeamFromGist() {
  return readGistFile(TEAM_FILE)
}

export async function saveTeamToGist(members) {
  return writeGistFiles({ [TEAM_FILE]: members })
}

// ── Assignments ──────────────────────────────────────────────────────────────

export async function loadAssignmentsFromGist() {
  return readGistFile(ASSIGN_FILE)
}

export async function saveAssignmentsToGist(assignments) {
  return writeGistFiles({ [ASSIGN_FILE]: assignments })
}

// ── Remarks ─────────────────────────────────────────────────────────────────

export async function loadRemarksFromGist() {
  return readGistFile(REMARKS_FILE)
}

export async function saveRemarksToGist(remarks) {
  return writeGistFiles({ [REMARKS_FILE]: remarks })
}

export const gistConfigured = Boolean(GIST_ID && GITHUB_TOKEN)
