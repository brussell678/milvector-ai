# 25 Connector Architecture

## Purpose

Describe external service connections affected by the mobile/auth overhaul.

## Supabase

- Browser client uses anon key.
- Server client uses SSR cookie helpers.
- Auth must support email/password and magic link.
- Profile rows must sync after signup/login.
- RLS must remain enabled.

## OpenAI

- AI tool APIs should remain unchanged during mobile UI sprints.
- UI refactors must not increase model calls.

## Vercel

- Build command should remain compatible with Next.js 16 webpack build.
- Deployment verification occurs in Sprint 9.

## Cloudflare

- Domain routing and auth redirect behavior may require verification if `/auth` changes redirect URLs.

