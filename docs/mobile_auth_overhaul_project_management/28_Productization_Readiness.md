# 28 Productization Readiness

## Readiness Checklist

- [x] Production build passes
- [ ] Auth settings verified in Supabase
- [ ] Email/password signup works
- [ ] Email/password login works
- [ ] Magic link still works
- [ ] Password reset works
- [ ] Logout works on mobile
- [ ] Dashboard works at 360px
- [ ] Timeline works at 360px
- [ ] Tools work at 360px
- [x] Library works at 360px
- [x] Knowledge base works at 360px
- [x] Upload warnings are complete
- [ ] Vercel deployment verified
- [ ] Cloudflare domain behavior verified

## Sprint 09 Local Verification Notes

- `npm run lint`: passed on 2026-05-25.
- `npm run build`: passed on 2026-05-25.
- Public viewport screenshots captured at 360px, 390px, 430px, 768px, and 1024px for `/`, `/platform`, `/auth`, `/library`, `/knowledge-base`, `/feedback`, `/message-board`, and `/donate`.
- Public footer overlay issue found during screenshot QA and fixed by moving `.site-footer` into normal document flow.
- Unauthenticated route protection verified for `/app`, `/app/profile`, `/app/documents`, `/app/tools`, `/app/timeline`, `/app/library`, `/app/knowledge-base`, `/app/feedback`, `/app/message-board`, and `/app/donate`; all return `307` to `/auth`.
- `/login` compatibility redirect verified: `307` to `/auth`.
- `/auth/confirm` fallback redirect verified locally: `307` to `/auth`.
- Auth signup, login, magic link, password reset, logout, Vercel, and Cloudflare remain live-environment checks because production Supabase settings and deployment verification are external to local code QA.
