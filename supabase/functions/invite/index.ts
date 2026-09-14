// Invitation emails and invite sign-up for Jamify.
//
//   { action: 'send', memberId, appUrl }        (re)issue an invitation for a pending member and email it
//   { action: 'test', workspaceId }             send a test email with the workspace's SMTP settings
//   { action: 'signup', token, password, name } create a confirmed account for the invited address
//
// Deployed with verify_jwt = false: 'signup' runs before the invitee has an account (the invitation
// token is the credential), and 'send' / 'test' verify the caller's access token themselves.
// Supabase blocks outgoing connections to ports 25 and 587, so SMTP has to use 465 or 2525.

import { createClient, type User } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  username: string
  password: string | null
  fromEmail: string
  fromName: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  try {
    const body = await req.json().catch(() => ({}))
    switch (body.action) {
      case 'send': return json(await sendInvite(req, body))
      case 'test': return json(await sendTest(req, body))
      case 'signup': return json(await signUp(body))
      default: throw new HttpError(400, 'Unknown action.')
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: (e as Error).message || 'Unexpected error.' }, 500)
  }
})

/* ── helpers ─────────────────────────────────────────────────── */

async function caller(req: Request): Promise<User> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Sign in first.')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Sign in again.')
  return data.user
}

async function requireAdmin(userId: string, workspaceId: string) {
  const { data: ws, error } = await admin.from('workspaces').select('id, name, user_id').eq('id', workspaceId).maybeSingle()
  if (error) throw error
  if (!ws) throw new HttpError(404, 'Workspace not found.')
  if (ws.user_id === userId) return ws
  const { data: m } = await admin.from('members').select('role').eq('workspace_id', workspaceId).eq('auth_user_id', userId).maybeSingle()
  if (!m || !['Owner', 'Admin'].includes(m.role)) throw new HttpError(403, 'Only workspace owners and admins can do this.')
  return ws
}

async function smtpFor(workspaceId: string): Promise<SmtpConfig | null> {
  const { data, error } = await admin.rpc('smtp_config_for_sending', { p_workspace: workspaceId })
  if (error) throw error
  return (data as SmtpConfig | null) ?? null
}

async function deliver(cfg: SmtpConfig, to: string, subject: string, text: string, html: string) {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.username ? { user: cfg.username, pass: cfg.password ?? '' } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
  try {
    await transport.sendMail({
      from: cfg.fromName ? { name: cfg.fromName, address: cfg.fromEmail } : cfg.fromEmail,
      to,
      subject,
      text,
      html,
    })
  } finally {
    transport.close()
  }
}

const displayName = (u: User) => String(u.user_metadata?.name || u.user_metadata?.full_name || u.email || 'Someone')

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function appOrigin(req: Request, appUrl: unknown) {
  for (const candidate of [appUrl, req.headers.get('origin')]) {
    if (typeof candidate !== 'string') continue
    try {
      const u = new URL(candidate)
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.origin
    } catch { /* try the next one */ }
  }
  return Deno.env.get('APP_URL') ?? 'https://jamify-pi.vercel.app'
}

function emailLayout(heading: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f2f6f8;font-family:Roboto,Helvetica,Arial,sans-serif;color:#333">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #dde4e8;border-radius:4px">
<tr><td style="padding:28px 32px 8px;font-size:20px;font-weight:500">jamify</td></tr>
<tr><td style="padding:8px 32px 28px;font-size:15px;line-height:1.55">
<h1 style="margin:0 0 12px;font-size:18px;font-weight:500">${heading}</h1>${bodyHtml}
</td></tr></table></td></tr></table></body></html>`
}

/* ── actions ─────────────────────────────────────────────────── */

async function sendInvite(req: Request, body: { memberId?: string; appUrl?: string }) {
  const user = await caller(req)
  if (!body.memberId) throw new HttpError(400, 'memberId is required.')
  const { data: member, error } = await admin
    .from('members').select('id, workspace_id, name, email, auth_user_id').eq('id', body.memberId).maybeSingle()
  if (error) throw error
  if (!member) throw new HttpError(404, 'Member not found.')
  const ws = await requireAdmin(user.id, member.workspace_id)
  if (member.auth_user_id) throw new HttpError(400, `${member.name} has already joined this workspace.`)

  // a new invitation replaces any earlier link for this member
  const { error: delErr } = await admin.from('invitations').delete().eq('member_id', member.id).is('accepted_at', null)
  if (delErr) throw delErr
  const token = newToken()
  const { error: insErr } = await admin.from('invitations').insert({
    workspace_id: ws.id, member_id: member.id, email: member.email, token_hash: await sha256(token), invited_by: user.id,
  })
  if (insErr) throw insErr
  const link = `${appOrigin(req, body.appUrl)}/invite/${token}`

  const cfg = await smtpFor(ws.id)
  if (!cfg) {
    return { sent: false, link, reason: 'smtp_missing', error: 'No SMTP server is set up for this workspace, so no email was sent.' }
  }

  const inviter = displayName(user)
  const subject = `${inviter} invited you to ${ws.name} on Jamify`
  const text = `${inviter} invited you to join the "${ws.name}" workspace on Jamify.\n\nAccept the invitation: ${link}\n\nThe link expires in 14 days. If you weren't expecting this, you can ignore this email.`
  const html = emailLayout(
    `Join ${esc(ws.name)} on Jamify`,
    `<p style="margin:0 0 20px">${esc(inviter)} invited you to track time in the <b>${esc(ws.name)}</b> workspace.</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#03a9f4;color:#fff;text-decoration:none;padding:11px 22px;border-radius:2px;font-size:14px;font-weight:500;letter-spacing:.03em;text-transform:uppercase">Accept invitation</a></p>
<p style="margin:0 0 6px;font-size:13px;color:#666">Or open this link:</p>
<p style="margin:0 0 20px;font-size:13px;word-break:break-all"><a href="${link}" style="color:#03a9f4">${link}</a></p>
<p style="margin:0;font-size:12px;color:#999">The link expires in 14 days. If you weren't expecting this, you can ignore this email.</p>`,
  )
  try {
    await deliver(cfg, member.email, subject, text, html)
    return { sent: true, link }
  } catch (e) {
    console.error('smtp send failed', e)
    return { sent: false, link, reason: 'smtp_error', error: `The SMTP server did not accept the message: ${(e as Error).message}` }
  }
}

async function sendTest(req: Request, body: { workspaceId?: string }) {
  const user = await caller(req)
  if (!body.workspaceId) throw new HttpError(400, 'workspaceId is required.')
  if (!user.email) throw new HttpError(400, 'Your account has no email address.')
  const ws = await requireAdmin(user.id, body.workspaceId)
  const cfg = await smtpFor(ws.id)
  if (!cfg) throw new HttpError(400, 'Save the SMTP settings first.')
  try {
    await deliver(
      cfg,
      user.email,
      `Jamify test email for ${ws.name}`,
      `Your SMTP settings for "${ws.name}" work. Invitations from this workspace will be sent from ${cfg.fromEmail}.`,
      emailLayout('SMTP is working', `<p style="margin:0">Invitations from <b>${esc(ws.name)}</b> will be sent from ${esc(cfg.fromEmail)}.</p>`),
    )
    return { ok: true, to: user.email }
  } catch (e) {
    console.error('smtp test failed', e)
    return { ok: false, to: user.email, error: (e as Error).message }
  }
}

async function signUp(body: { token?: string; password?: string; name?: string }) {
  if (!body.token) throw new HttpError(400, 'The invitation link is incomplete.')
  if (!body.password || body.password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.')
  const { data: inv, error } = await admin
    .from('invitations').select('email, expires_at, accepted_at').eq('token_hash', await sha256(body.token)).maybeSingle()
  if (error) throw error
  if (!inv || inv.accepted_at) throw new HttpError(400, 'This invitation link is no longer valid.')
  if (new Date(inv.expires_at) < new Date()) throw new HttpError(400, 'This invitation has expired. Ask for a new one.')

  // the invitation proves the address, so the account is confirmed right away
  const name = body.name?.trim()
  const { error: createErr } = await admin.auth.admin.createUser({
    email: inv.email, password: body.password, email_confirm: true, user_metadata: name ? { name } : {},
  })
  if (createErr) {
    if (/already|exists|registered/i.test(createErr.message)) throw new HttpError(409, 'An account with this email already exists. Log in instead.')
    throw new HttpError(400, createErr.message)
  }
  return { email: inv.email }
}
