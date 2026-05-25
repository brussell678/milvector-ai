# 10 Risk Management Plan

## Key Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Auth regression locks users out | High | Preserve magic link, test email/password, verify route protection |
| Supabase schema mismatch | High | Use additive migrations only, inspect existing schema first |
| Mobile layout creates overflow | Medium | Test 360px and stacked layouts per sprint |
| Broad refactor causes regressions | High | Work one sprint at a time, avoid unrelated files |
| Upload warning missed on a surface | Medium | Centralize `UploadWarning` component and audit upload pages |
| AI tool UI changes disrupt saved outputs | High | Keep API routes and artifact logic unchanged unless required |
| Context drift across sprints | Medium | Use this document pack as the source of sprint continuity |

## Risk Review

Review this plan at the start of each sprint and update if new risks emerge.

