import { supabase } from './supabase'
import type { Member } from '../types'

/* ── invitations ───────────────────────────────────────────── */

export interface InviteResult {
  sent: boolean
  /** the accept link; share it by hand when the email could not be sent */
  link: string
  reason?: 'smtp_missing' | 'smtp_error'
  error?: string
}

export interface InvitationInfo {
  status: 'valid' | 'expired' | 'accepted' | 'invalid'
  email?: string
  workspaceName?: string
  memberName?: string
  inviterName?: string
  userExists?: boolean
}

/** Calls the `invite` edge function and surfaces its `{ error }` body instead of the generic HTTP error. */
async function callInvite<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('invite', { body })
  if (error) {
    const res = (error as { context?: unknown }).context
    if (res instanceof Response) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (payload?.error) throw new Error(payload.error)
    }
    throw new Error(error.message)
  }
  return data as T
}

export const sendInvite = (memberId: string) =>
  callInvite<InviteResult>({ action: 'send', memberId, appUrl: window.location.origin })

/** Outcome of inviting one member: the edge function's result, or why the invitation couldn't be created. */
export interface InviteRow {
  member: Member
  res?: InviteResult
  error?: string
}

/** Sends invitations one at a time (gentle on the SMTP server); a failure is recorded on its row. */
export async function sendInvites(members: Member[], onProgress?: (done: number) => void): Promise<InviteRow[]> {
  const rows: InviteRow[] = []
  for (const member of members) {
    try {
      rows.push({ member, res: await sendInvite(member.id) })
    } catch (e) {
      rows.push({ member, error: (e as Error).message })
    }
    onProgress?.(rows.length)
  }
  return rows
}

export const signUpFromInvite =(token: string, password: string, name: string) =>
  callInvite<{ email: string }>({ action: 'signup', token, password, name })

export async function getInvitation(token: string): Promise<InvitationInfo> {
  const { data, error } = await supabase.rpc('get_invitation', { p_token: token })
  if (error) throw new Error(error.message)
  return data as InvitationInfo
}

/** Links the signed-in user to the invited member row; returns the workspace id. */
export async function acceptInvitation(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
  if (error) throw new Error(error.message)
  return data as string
}

/* ── SMTP settings ─────────────────────────────────────────── */

export interface SmtpSettings {
  host: string
  port: number
  secure: boolean
  username: string
  fromEmail: string
  fromName: string
  hasPassword: boolean
  updatedAt: string
}

export async function getSmtpSettings(workspaceId: string): Promise<SmtpSettings | null> {
  const { data, error } = await supabase.rpc('get_smtp_settings', { p_workspace: workspaceId })
  if (error) throw new Error(error.message)
  return (data as SmtpSettings | null) ?? null
}

/** An empty password keeps the stored one. */
export async function saveSmtpSettings(workspaceId: string, s: Omit<SmtpSettings, 'hasPassword' | 'updatedAt'> & { password: string }) {
  const { error } = await supabase.rpc('save_smtp_settings', {
    p_workspace: workspaceId, p_host: s.host, p_port: s.port, p_secure: s.secure, p_username: s.username,
    p_password: s.password, p_from_email: s.fromEmail, p_from_name: s.fromName,
  })
  if (error) throw new Error(error.message)
}

export async function deleteSmtpSettings(workspaceId: string) {
  const { error } = await supabase.rpc('delete_smtp_settings', { p_workspace: workspaceId })
  if (error) throw new Error(error.message)
}

export const sendTestEmail = (workspaceId: string) =>
  callInvite<{ ok: boolean; to: string; error?: string }>({ action: 'test', workspaceId })
