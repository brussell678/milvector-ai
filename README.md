# MILVECTOR AI (MVP)

Next.js App Router application for guided military transition workflows with AI tools:
- Master Resume Builder
- MOS translator
- Job Description Decoder
- Targeted Resume Builder

## Prerequisites
- Node.js 20+
- A Supabase project
- An OpenAI API key

## Environment Variables
Create `.env.local` in project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-4o-mini
LLM_TIMEOUT_MS=30000
# Optional:
# OPENAI_BASE_URL=https://api.openai.com/v1
# MAX_UPLOAD_MB=10
```

## Database + RLS Setup
1. Open Supabase SQL Editor.
2. Run: [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql)
3. Run hardening: [supabase/migrations/0002_security_and_metrics.sql](supabase/migrations/0002_security_and_metrics.sql)
4. Verify bucket `documents` exists and RLS policies are created.

## Local Run
```bash
npm install
npm run dev
```

Health check:
- `GET /api/health`
- `GET /api/metrics` (authenticated)

## Quality Checks
```bash
npm run lint
npm run build
```

## Notes
- `node_modules` is intentionally not committed to Git.
- Text extraction supports PDF, DOCX, TXT, and MD (legacy DOC upload allowed, but extraction requires conversion).
- Tool runs are logged without raw document text.
- PRD traceability: [PRD_CHECKLIST.md](PRD_CHECKLIST.md)

