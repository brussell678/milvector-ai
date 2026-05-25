# 23 Development Approach

## Approach

Use adaptive agile delivery with strict sprint boundaries.

## Technical Principles

- Prefer existing repo patterns.
- Use server components where practical.
- Keep client components scoped to interactivity.
- Avoid new dependencies unless needed.
- Use Tailwind mobile-first classes.
- Keep auth logic aligned with Supabase client patterns.
- Preserve existing APIs and data flows.

## Verification

Run build after every sprint:

```bash
npm run build
```

Run lint when changes touch TypeScript, JSX, or shared styles:

```bash
npm run lint
```

