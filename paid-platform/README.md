# MTG Opening Hand Analyzer Paid Platform

This folder is the separate paid-product track. The current Streamlit beta remains at the repository root and should keep serving testers while this app grows into the subscription platform.

## Target Stack

- Frontend and product shell: Next.js
- Auth and database: Supabase free tier while in early development
- Payments: Stripe, added after accounts and saved data are stable
- Analysis engine: reuse the existing Python analyzer through an API once the product shell is ready

## Local Setup

```powershell
pnpm install
pnpm run dev
```

Create `.env.local` from `.env.example` before enabling Supabase-backed features.

If using the bundled Codex package manager, it may ask to approve the
`unrs-resolver` build script. The app itself can be validated with Next after
dependencies are installed:

```powershell
node .\node_modules\next\dist\bin\next build
node .\node_modules\next\dist\bin\next lint
```

## Accounts

The first account flow is in place:

- `/signup` creates a Supabase auth user.
- `/login` signs in with email and password.
- `/dashboard` is guarded and shows a setup message until Supabase keys exist.
- The dashboard includes sign-out once a user is authenticated.

To enable it, create a free Supabase project, copy the project URL and anon key
into `.env.local`, then run the SQL in `supabase/schema.sql`.

## Product Boundary

The paid app should own:

- User accounts
- Saved decklists
- Saved opening-hand sessions
- Rating history
- Subscription and entitlement checks
- Shareable reports

The beta app should continue to own:

- Fast experiments
- Screenshot-recognition iteration
- Tester feedback loops
- Local-only workflows

## No-Cost Build Path

1. Build the paid shell locally in this folder.
2. Use Supabase free tier for auth and database.
3. Use Vercel free tier for preview deployments.
4. Keep Stripe in test mode until the product is ready to charge.
5. Move analyzer logic behind an API only when the app needs saved sessions and accounts.
