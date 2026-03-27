import { useState, useRef, useEffect } from "react"
import { loadTeamMembers, ROLE_CONFIG, ROLES } from "../lib/teamConfig"

function MemberOption({ member, isSelected, onToggle }) {
  const rc = ROLE_CONFIG[member.role]
  const initial = member.name[0].toUpperCase()
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(member.name) }}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-all w-full text-left ${
        isSelected
          ? `${rc.bg} ring-1 ${rc.ring}`
          : "hover:bg-gray-50"
      }`}
    >
      {member.avatar ? (
        <img src={member.avatar} alt={member.name} className={`h-6 w-6 rounded-full object-cover ring-1 ${isSelected ? rc.ring : "ring-gray-200"}`} />
      ) : (
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ring-1 ${
          isSelected ? `${rc.bg} ${rc.ring}` : "bg-gray-100 text-gray-400 ring-gray-200"
        }`}>
          {initial}
        </span>
      )}
      <span className={`text-xs font-medium ${isSelected ? "text-gray-800" : "text-gray-500"}`}>
        {member.name}
      </span>
      {isSelected && (
        <svg className="ml-auto h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  )
}

/**
 * Inline assignment display + popup editor.
 * Shows assigned team avatars; click to open assignment popup.
 *
 * @param {string} clientName
 * @param {object} assignments — full assignments map from App state
 * @param {function} onUpdate — (clientName, { creative: "Tony", ae: "Pleng", pm: "Boom" }) => void
 * @param {boolean} compact — smaller display for table rows
 */
export default function AssignTeam({ clientName, assignments, onUpdate, compact = false }) {
  const [showPopup, setShowPopup] = useState(false)
  const popupRef = useRef(null)

  const current = assignments[clientName] || {}

  // Close on outside click
  useEffect(() => {
    if (!showPopup) return
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) setShowPopup(false)
    }
    // Use capture phase so we catch clicks even when stopPropagation is used
    document.addEventListener("pointerdown", handler, true)
    return () => document.removeEventListener("pointerdown", handler, true)
  }, [showPopup])

  const toggleMember = (role, name) => {
    const updated = { ...current }
    if (updated[role] === name) {
      delete updated[role]
    } else {
      updated[role] = name
    }
    onUpdate(clientName, updated)
  }

  const allMembers = loadTeamMembers()
  const hasAssignment = ROLES.some((r) => current[r])

  return (
    <div className="relative" ref={popupRef}>
      {/* Display assigned members or assign button */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowPopup(!showPopup) }}
        className={`flex items-center gap-1 rounded-lg transition-all ${
          compact ? "px-1 py-0.5" : "px-1.5 py-1"
        } ${showPopup ? "bg-purple-100 ring-1 ring-purple-300" : "hover:bg-purple-50"}`}
        title="Assign team"
      >
        {hasAssignment ? (
          <div className="flex items-center -space-x-1">
            {ROLES.map((role) => {
              const name = current[role]
              if (!name) return null
              const member = allMembers.find((m) => m.name === name)
              if (!member) return null
              const rc = ROLE_CONFIG[role]
              const initial = member.name[0].toUpperCase()
              const size = compact ? rc.xsSizeClass : rc.smSizeClass
              const text = compact ? rc.xsTextClass : rc.smTextClass
              return member.avatar ? (
                <img key={role} src={member.avatar} alt={member.name} className={`${size} rounded-full object-cover ring-1 ${rc.ring} ring-offset-1`} />
              ) : (
                <span key={role} className={`${size} ${text} ${rc.bg} rounded-full ring-1 ${rc.ring} ring-offset-1 flex items-center justify-center font-bold`}>
                  {initial}
                </span>
              )
            })}
          </div>
        ) : (
          <span className={`flex items-center gap-1 ${compact ? "text-[9px]" : "text-[10px]"} text-purple-300 hover:text-purple-500`}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Assign
          </span>
        )}
      </button>

      {/* Popup */}
      {showPopup && (
        <div className="absolute z-50 top-full mt-1 left-0 w-56 rounded-xl border border-purple-200 bg-white shadow-lg p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-1">
            Assign Team — {clientName}
          </div>

          {ROLES.map((role) => {
            const rc = ROLE_CONFIG[role]
            const members = allMembers.filter((m) => m.role === role)
            return (
              <div key={role}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${rc.bg}`}>
                    {rc.label}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {members.map((m) => (
                    <MemberOption
                      key={m.name}
                      member={m}
                      isSelected={current[role] === m.name}
                      onToggle={(name) => toggleMember(role, name)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {hasAssignment && (
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate(clientName, {}); setShowPopup(false) }}
              className="w-full rounded-lg border border-red-100 px-2 py-1.5 text-[10px] font-medium text-red-400 transition hover:bg-red-50 hover:text-red-600"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
