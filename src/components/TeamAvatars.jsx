import { matchMembers, ROLE_CONFIG } from "../lib/teamConfig"

/**
 * Shared avatar component — shows team member initials/photos
 * sorted by role size: Creative (biggest) → AE → PM (smallest)
 *
 * @param {string} responsibility — raw string from Google Sheet column C
 * @param {boolean} small — use smaller variant (for timeline rows)
 */
export default function TeamAvatars({ responsibility, small = false }) {
  const members = matchMembers(responsibility)
  if (members.length === 0) return null

  return (
    <div className="flex items-center -space-x-1.5" title={members.map((m) => `${m.name} (${ROLE_CONFIG[m.role].label})`).join(", ")}>
      {members.map((m) => {
        const rc = ROLE_CONFIG[m.role]
        const size = small ? rc.smSizeClass : rc.sizeClass
        const text = small ? rc.smTextClass : rc.textClass
        const initial = m.name[0].toUpperCase()

        return m.avatar ? (
          <img
            key={m.name}
            src={m.avatar}
            alt={m.name}
            className={`${size} rounded-full ring-2 ${rc.ring} ring-offset-1 object-cover shrink-0`}
          />
        ) : (
          <span
            key={m.name}
            className={`${size} ${rc.bg} ${text} rounded-full ring-2 ${rc.ring} ring-offset-1 flex items-center justify-center font-bold shrink-0`}
          >
            {initial}
          </span>
        )
      })}
    </div>
  )
}
