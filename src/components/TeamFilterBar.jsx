import { ROLE_CONFIG, ROLES } from "../lib/teamConfig"

/**
 * Compact horizontal filter chips for team members.
 * Shows avatar-only by default, name appears when active.
 */
export default function TeamFilterBar({ activeMember, onSelect, members = [] }) {
  const activeRoles = ROLES.filter((r) => members.some((m) => m.role === r))

  return (
    <div className="flex items-center gap-1 flex-nowrap whitespace-nowrap">
      {/* "All" chip */}
      <button
        onClick={() => onSelect(null)}
        className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-all shrink-0 ${
          !activeMember
            ? "bg-purple-600 text-white shadow-sm"
            : "bg-gray-100 text-gray-400 hover:bg-purple-50 hover:text-purple-600"
        }`}
      >
        All
      </button>

      <div className="h-4 w-px bg-purple-200/60 mx-0.5 shrink-0" />

      {activeRoles.map((role, ri) => {
        const rc = ROLE_CONFIG[role]
        const roleMembers = members.filter((m) => m.role === role)

        return (
          <div key={role} className="flex items-center gap-0.5 shrink-0">
            {roleMembers.map((m) => {
              const isActive = activeMember === m.name
              const initial = m.name[0]?.toUpperCase() || "?"

              return (
                <button
                  key={m.name}
                  onClick={() => onSelect(isActive ? null : m.name)}
                  title={`${m.name} (${rc.label})`}
                  className={`flex items-center gap-1 rounded-full p-0.5 transition-all duration-200 shrink-0 ${
                    isActive
                      ? `${rc.bg} ring-1 ${rc.ring} shadow-sm pr-2 animate-chip-glow animate-magic-shimmer`
                      : "hover:bg-gray-50"
                  }`}
                >
                  {m.avatar ? (
                    <img
                      src={m.avatar}
                      alt={m.name}
                      className={`h-6 w-6 rounded-full object-cover ring-1 ${isActive ? rc.ring : "ring-gray-200"}`}
                    />
                  ) : (
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ring-1 ${
                        isActive ? `${rc.bg} ${rc.ring} text-gray-700` : "bg-gray-100 text-gray-500 ring-gray-200"
                      }`}
                    >
                      {initial}
                    </span>
                  )}
                  {isActive && (
                    <span className="text-[10px] font-semibold text-gray-700">
                      {m.name}
                    </span>
                  )}
                </button>
              )
            })}

            {ri < activeRoles.length - 1 && <div className="h-4 w-px bg-purple-100/60 mx-0.5" />}
          </div>
        )
      })}
    </div>
  )
}
