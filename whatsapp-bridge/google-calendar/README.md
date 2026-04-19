# Google Calendar integration (per clinic)

## Overview

Each row in `clinics` can be linked to a Google Calendar via OAuth tokens stored outside this repo (recommended: encrypted table `clinic_calendar_accounts` — add in a future migration) or via n8n **Google Calendar** credentials scoped per clinic.

## Setup (high level)

1. Create a Google Cloud project and enable **Google Calendar API**.
2. Create OAuth 2.0 **Web application** or **Desktop** client credentials.
3. Add authorized redirect URI: e.g. `http://localhost:8787/oauth/google/callback` (implement in your Ops API or n8n).
4. Store refresh tokens per `clinic_id` (never commit tokens).

## n8n path (recommended for MVP)

- Use n8n’s **Google Calendar** nodes with one credential per clinic, or one credential + multiple calendar IDs in DB column `clinics.metadata->>'google_calendar_id'`.

## Stub module

See [`../lib/googleCalendar.js`](../lib/googleCalendar.js) for placeholder `listBusySlots` / `createEvent` signatures to wire from n8n HTTP Request or a small Node service later.
