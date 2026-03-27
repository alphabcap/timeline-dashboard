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
const FILENAME     = "magic-team.json"
const API_BASE     = "https://api.github.com/gists"

function authHeaders() {
  const h = { Accept: "application/vnd.github+json" }
  if (GITHUB_TOKEN) h["Authorization"] = `Bearer ${GITHUB_TOKEN}`
  return h
}

/** Fetch team members from Gist. Returns array or null on failure. */
export async function loadTeamFromGist() {
  if (!GIST_ID) return null
  try {
    const res = await fetch(`${API_BASE}/${GIST_ID}`, { headers: authHeaders() })
    if (!res.ok) return null
    const gist    = await res.json()
    const content = gist.files?.[FILENAME]?.content
    if (!content) return null
    return JSON.parse(content)
  } catch {
    return null
  }
}

/** Save team members to Gist. Returns true on success. */
export async function saveTeamToGist(members) {
  console.log("[Gist] saveTeamToGist called", { GIST_ID: !!GIST_ID, GITHUB_TOKEN: !!GITHUB_TOKEN, memberCount: members?.length })
  if (!GIST_ID || !GITHUB_TOKEN) {
    console.warn("[Gist] Missing GIST_ID or GITHUB_TOKEN — cannot save")
    return false
  }
  try {
    const res = await fetch(`${API_BASE}/${GIST_ID}`, {
      method:  "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body:    JSON.stringify({
        files: { [FILENAME]: { content: JSON.stringify(members) } },
      }),
    })
    console.log("[Gist] PATCH response:", res.status)
    return res.ok
  } catch (err) {
    console.error("[Gist] Save failed:", err)
    return false
  }
}

export const gistConfigured = Boolean(GIST_ID && GITHUB_TOKEN)
