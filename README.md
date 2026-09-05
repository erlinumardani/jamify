# Jamify

Jamify is a time tracker inspired by [Clockify](https://clockify.me), built with React 19, TypeScript, Vite and Tailwind CSS v4.
Data is stored in [Supabase](https://supabase.com) (Postgres + Auth): each user signs in with email and password or Google and gets
their own workspace, isolated by row level security. New workspaces start empty.

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
- **Team** – roles (Owner/Admin/Manager/Member), billable rate, **cost rate**, working hours per day.
- **Settings** – rounding (interval and direction), **timesheet lock date**, **required fields**, targets, alert percentage, currency, week start, formats, JSON export/import, **CSV timesheet import**, delete all data.

Not included: browser extension/desktop timers, idle detection, kiosk, GPS, screenshots, SSO, QuickBooks sync.

## Run

```bash
npm install
cp .env.example .env.local   # optional: point at your own Supabase project
npm run dev
```

Open http://localhost:5173. Without a `.env.local` the app uses the built-in Supabase project.

## Supabase

The schema lives in the project's migrations (`workspaces`, `members`, `clients`, `projects`, `tasks`, `tags`, `time_entries`, `expenses`, `invoices`, `time_off_policies`, `time_off_requests`, `approvals`, `schedules`),
all protected by RLS policies of the form `user_id = auth.uid()`. To use your own project, apply the same schema and set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

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
  store.tsx           reducer + optimistic write-through to Supabase (useStore)
  auth.tsx            Supabase Auth provider and login / sign-up page
  lib/supabase.ts     Supabase client
  lib/db.ts           row mapping, initial load, persistence of each action
  lib/time.ts         duration/time parsing and formatting, date ranges
  components/         Layout, UI kit, ProjectPicker, TagPicker, EntryModal
  pages/              TimeTracker, Calendar, Timesheet, Approvals, TimeOff, Schedule,
                      Dashboard, Reports, Expenses, Invoices, Projects, ProjectDetail,
                      Clients, Tags, Team, Settings
```
