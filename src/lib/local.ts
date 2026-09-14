/** localStorage keys; access is wrapped because storage can be blocked (private mode, disabled site data). */
export const WORKSPACE_KEY = 'jamify.workspace'
export const PENDING_INVITE_KEY = 'jamify.pendingInvite'

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: the app falls back to defaults */
  }
}
