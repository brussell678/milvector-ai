# MILVECTOR AI

Next.js App Router application for the military transition, live at https://www.milvector.org.

Tools in the workspace (the Tools hub renders from `lib/tools/registry.ts`):
- MOS Translator
- Master Resume Builder
- LinkedIn Profile Builder
- Digital Business Card
- Targeted Resume Builder
- Job Description Decoder
- Interview Strategist
- Retirement Pay Calculator (public, no account)
- VA Rating Navigator
- SBP Decision Advisor
- Retirement Invitation Builder

## Prerequisites
- Node.js 20+
- A Supabase project
- An OpenAI API key

## Environment Variables
Copy `.env.example` to `.env.local` and fill it in. Every variable is described there.
Models and reasoning effort default in `lib/env.ts`; set the `*_MODEL` variables only to override.

## Database + RLS Setup
1. Open the Supabase SQL Editor.
2. Run every file in [supabase/migrations](supabase/migrations) in order, from `0001_init.sql` to the newest.
   There is no staging database, so migrations are additive and are run by hand.
3. Verify the `documents` storage bucket exists and RLS policies are created.

## Local Run
```bash
npm install
npm run dev
```

Health check:
- `GET /api/health`

## Quality Checks
```bash
npm run check   # lint, typecheck, and unit tests
npm run build
```
Run the unit tests from PowerShell. In Git Bash, vitest fails every suite with "reading 'config'".

## Notes
- `node_modules` is intentionally not committed to Git.
- Text extraction supports PDF, DOCX, TXT, and MD (legacy DOC upload allowed, but extraction requires conversion).
- SSN and DoD ID (EDIPI) numbers are removed from document text before it is stored or sent to a model (`lib/redact.ts`).
- Tool runs are logged without raw document text.
- User-facing changes get an entry in `WHATSNEW.md`; see `CLAUDE.md`.
