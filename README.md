# Jamify

Jamify is a time tracker inspired by [Clockify](https://clockify.me), built with React 19, TypeScript, Vite and Tailwind CSS v4.
Data is stored in [Supabase](https://supabase.com) (Postgres + Auth): people sign in with email and password or Google, work in
shared workspaces, and invite teammates by email. Every row belongs to a workspace and is protected by row level security.
New workspaces start empty.

## Features

Core tracking
- **Time Tracker** – timer and manual mode, entries grouped by week/day, inline editing, continue, duplicate, **split**, **bulk edit** (project, tags, billable, delete), required-field validation and locked-period protection.
- **Calendar** – week/day grid with overlap layout, current-time line, approved time off shown per day; click to add or edit.
- **Timesheet** – weekly grid per project/task, copy last week, **submit for approval**; approved or locked weeks are read-only.
- **Dashboard** – today/week totals with **daily and weekly targets**, billable share, earnings and profit, **budget alerts**, pending approvals and time off, weekly chart, top projects, recent activity.
- **Reports** – date presets and custom ranges, filters by project/client/member/tag/billable/description, **time rounding**, amount, **labor cost and profit**, expenses, per-project and per-member breakdowns, CSV export.

Premium-style features (Clockify Basic/Standard/Pro equivalents)
- **Expenses** – categorised, billable or not, per project and member; included in project budgets, reports and invoices.
- **Invoices** – per client, pull in unbilled billable time (grouped by project and rate, rounded) and expenses, custom lines, tax and discount, Draft/Sent/Paid/Void, print to PDF.
- **Time Off** – policies with yearly allowances, requests with approve/reject, balances, shown on Calendar and Schedule.
- **Approvals** – submit weekly timesheets, approve/reject as Owner/Admin/Manager; approving locks the week.
- **Schedule** – member × day assignments with hours per day versus capacity, weekly project totals.
- **Projects** – estimates and money **budgets** with alert thresholds, **favorites**, **templates**, notes, **task hourly rates**, archive.
- **Team** – **invite by email**, resend or copy invitation links, roles (Owner/Admin/Manager/Member), billable rate, **cost rate**, working hours per day.
- **Workspaces** – switch between the workspaces you own or joined, create new ones from the header menu.
- **Project access** – public or **private projects** with project members; invite someone by email straight into a project.
- **Settings** – rounding (interval and direction), **timesheet lock date**, **required fields**, targets, alert percentage, currency, week start, formats, **SMTP server for invitation emails**, JSON export/import, **CSV timesheet import**, delete all data.

Not included: browser extension/desktop timers, idle detection, kiosk, GPS, screenshots, SSO, QuickBooks sync.

## Run

```bash
npm install
cp .env.example .env.local   # optional: point at your own Supabase project
npm run dev
```

Open http://localhost:5173. Without a `.env.local` the app uses the built-in Supabase project.

## Supabase

The schema lives in the project's migrations (`workspaces`, `members`, `clients`, `projects`, `project_members`, `tasks`, `tags`, `time_entries`, `expenses`, `invoices`, `time_off_policies`, `time_off_requests`, `approvals`, `schedules`, `invitations`, `workspace_smtp`);
the ones for shared workspaces are in [`supabase/migrations`](supabase/migrations). Every data table has a `workspace_id`, and people
belong to a workspace through a `members` row linked to their auth user (`members.auth_user_id`). RLS policies grant:

| Role | Can |
| --- | --- |
| Member | see the workspace, public projects and private ones they were added to; track, edit and delete their own time and expenses; request time off and submit timesheets |
| Manager | everything a member can, plus all time and expenses, projects, clients, tags, invoices, schedules, approvals |
| Admin / Owner | everything, plus members, invitations, workspace settings and SMTP |

To use your own project, apply the same schema and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Invitations and email

Inviting someone adds a pending member and calls the [`invite` edge function](supabase/functions/invite/index.ts), which stores a
hashed, single-use token (valid 14 days) and emails an `/invite/<token>` link through the workspace's SMTP server. The invitee logs
in, creates an account (confirmed straight away, since the link proves the address) or continues with Google, and joins the
workspace. The link is also shown in the app so it can be shared by hand when no SMTP server is set up.

Set the SMTP server in **Settings → Email (SMTP)** (owners and admins). The password is kept in Supabase Vault and never returned to
the browser. Supabase Edge Functions can't open connections to ports 25 or 587, so use **465 (SSL/TLS)** or **2525 (STARTTLS)**:
Gmail, Resend, SendGrid, Mailgun and Zoho all offer 465.

Deploy the function with JWT verification off (it checks the caller's token itself, and sign-up runs before the invitee has an account):

```bash
supabase functions deploy invite --no-verify-jwt
```

## Google sign-in

Enable the Google provider in Supabase (Authentication → Providers → Google) with an OAuth client from Google Cloud whose
authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`, and add the app origins
(`https://jamify-pi.vercel.app`, `http://localhost:5173`) to Authentication → URL Configuration → Redirect URLs.

## Deploy

The app is a static Vite build; `vercel.json` rewrites every route to `index.html` for client-side routing.
Deploy to Vercel by importing the GitHub repository (framework preset: Vite).

```bash
npm run build   # type-check + production build into dist/
npm run preview # serve the production build
```

## Structure

```
src/
  types.ts            data model
  store.tsx           reducer + optimistic write-through to Supabase, workspace switching (useStore)
  auth.tsx            Supabase Auth provider and login / sign-up page
  lib/supabase.ts     Supabase client
  lib/db.ts           row mapping, workspace load, persistence of each action
  lib/invites.ts      invitation and SMTP settings calls (edge function + RPCs)
  lib/time.ts         duration/time parsing and formatting, date ranges
  components/         Layout, UI kit, ProjectPicker, TagPicker, EntryModal, InviteMemberModal, SmtpSettings
  pages/              TimeTracker, Calendar, Timesheet, Approvals, TimeOff, Schedule,
                      Dashboard, Reports, Expenses, Invoices, Projects, ProjectDetail,
                      Clients, Tags, Team, Settings, Invite (accept an invitation)
supabase/
  migrations/         shared workspaces, invitations, project access, SMTP settings
  functions/invite/   sends invitation and test emails, creates accounts from an invitation
```
