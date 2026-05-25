# 29 V1 Smoke Test Checklist

## Auth

- [ ] Sign up with email/password
- [ ] Log in with email/password
- [ ] Request magic link
- [ ] Request password reset
- [ ] Log out
- [x] Protected routes redirect unauthenticated users

## Viewports

- [x] 360px
- [x] 390px
- [x] 430px
- [x] 768px
- [x] 1024px
- [ ] Desktop wide

## Routes

- [x] `/`
- [x] `/platform`
- [x] `/auth`
- [x] `/app`
- [x] `/app/profile`
- [x] `/app/documents`
- [x] `/app/tools`
- [x] `/app/timeline`
- [x] `/app/library`
- [x] `/app/knowledge-base`
- [x] `/app/feedback`
- [x] `/app/message-board`
- [x] `/app/donate`

## Build

- [x] `npm run lint`
- [x] `npm run build`

## Sprint 09 Notes

- Public routes were screenshot-checked locally at 360px, 390px, 430px, 768px, and 1024px using Playwright Chromium.
- Authenticated `/app/*` route visual checks require a live authenticated test session; local unauthenticated route protection was verified instead.
- Live auth email flows, Vercel deployment, and Cloudflare/domain behavior remain post-push production checks.
