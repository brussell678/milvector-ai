# 09 Quality Management Plan

## Quality Goals

- Mobile usability at 360px, 390px, 430px, 768px, and desktop widths
- No route regressions
- No auth regressions
- No horizontal scrolling on major pages
- Build passes after every sprint
- Existing data and business logic preserved

## Verification Commands

```bash
npm run lint
npm run build
```

## Manual QA Areas

- Public home page
- Auth page
- App dashboard
- Profile
- Documents
- Tools
- Timeline
- Library
- Knowledge base
- Feedback
- Donate
- Message board
- Admin portal

## Quality Gate

Do not start the next sprint until the active sprint is either verified or has documented blockers approved for deferral.

