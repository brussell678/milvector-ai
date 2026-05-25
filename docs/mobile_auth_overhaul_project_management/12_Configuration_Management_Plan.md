# 12 Configuration Management Plan

## Managed Configuration Items

- Next.js routes
- Shared layout components
- Auth components
- Supabase migrations
- Environment variables
- Vercel deployment settings
- Cloudflare domain and redirect settings

## Environment Variables To Preserve

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `LLM_TIMEOUT_MS`
- Existing model override variables if present

## Configuration Rules

- Do not expose service role keys to client code.
- Use existing Supabase client patterns.
- Keep auth redirect URLs aligned with deployed domain.
- Document manual dashboard checks in the sprint closeout.

