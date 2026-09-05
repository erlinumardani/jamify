# Jamify

Jamify is a time tracker inspired by [Clockify](https://clockify.me), built with React 19, TypeScript, Vite and Tailwind CSS v4.
Data is stored in [Supabase](https://supabase.com) (Postgres + Auth): each user signs in with email and password or Google and gets
their own workspace, isolated by row level security. A fresh workspace is seeded with demo data on first sign-in.

## Features

- **Time Tracker** – start/stop timer, manual entry mode, entries grouped by week and day, inline editing of description, project/task, tags, billable flag, start/end time, date and duration; continue, duplicate and delete entries.
- **Calendar** – week/day grid with entries positioned by time, overlap layout, current-time line; click a slot to add, click an entry to edit.
- **Timesheet** – weekly grid per project/task, editable duration cells, add rows, copy last week.
- **Dashboard** – today/week totals, billable share, earnings, weekly bar chart, top projects, recent activity.
- **Reports** – date-range presets and custom ranges, filters (project, client, tag, billable, description), summary with daily bars and project donut, detailed list, CSV export.
- **Projects** – list with tracked time, amount, estimate progress; project page with tasks, status breakdown and settings (client, color, rate, estimate, archive, delete).
- **Clients, Tags, Team** – simple CRUD, archive/restore, roles and hourly rates.
- **Settings** – workspace name, currency, hourly rate, week start, time/duration format, billable default, JSON export/import, reset to demo data.

## Run

```bash
npm install
cp .env.example .env.local   # optional: point at your own Supabase project
npm run dev
```

Open http://localhost:5173. Without a `.env.local` the app uses the built-in Supabase project.

## Supabase

The schema lives in the project's migrations (`workspaces`, `members`, `clients`, `projects`, `tasks`, `tags`, `time_entries`),
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
  lib/seed.ts         demo workspace generator
  components/         Layout, UI kit, ProjectPicker, TagPicker, EntryModal
  pages/              TimeTracker, Calendar, Timesheet, Dashboard, Reports,
                      Projects, ProjectDetail, Clients, Tags, Team, Settings
```
