# Paid Platform Roadmap

## Phase 1: Product Shell

- Create a separate web app folder.
- Add dashboard, saved-deck, hand-session, and rating-history surfaces.
- Keep the beta app unchanged.

## Phase 2: Accounts and Storage

- Add Supabase auth.
- Save decklists per user.
- Save rating entries and confirmed hand sessions.
- Add export controls for users who want their own data.

## Phase 3: Analyzer API

- Wrap the existing Python analysis pipeline behind a local API.
- Keep screenshots and decklists private.
- Store only user-approved confirmed hands and results.

## Phase 4: Payment Readiness

- Add Stripe test-mode checkout.
- Add subscription status sync through webhooks.
- Gate paid-only history and reporting features.

## Phase 5: Public Launch

- Keep the free beta visible for testers.
- Put the paid platform on a separate production URL.
- Migrate only users who explicitly opt in.

