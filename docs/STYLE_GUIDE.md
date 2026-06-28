# MilVector AI — Style Guide

Reference anchor for all UI/UX work. Read this before touching any component.
Last updated: 2026-06-28 (Sprint 0 — UI/UX Upgrade)

---

## Design Philosophy

**Editorial warmth + military clarity.** MilVector serves service members in a high-stakes, high-emotion life transition. The UI must feel:
- Trustworthy — clean, structured, mission-grade
- Approachable — warm palette, readable type, no intimidating clutter
- Fast — every page communicates its purpose in under 5 seconds
- Professional — on par with premium SaaS products, not a nonprofit site

We are NOT doing: dark/neon techno-futurist (that's a developer tool vibe, wrong audience).
We ARE doing: editorial warmth with modern craft and polish.

---

## Color Palette

All colors are defined as CSS custom properties in `app/globals.css`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#f3f5f2` | `#0f1411` | Page background |
| `--foreground` | `#1a1f1b` | `#e8eee9` | Body text, headings |
| `--panel` | `#ffffff` | `#141b17` | Card/panel surfaces |
| `--line` | `#d7ddd8` | `#2b3830` | Borders, dividers |
| `--accent` | `#0f6d53` | `#39a67f` | Primary brand color, CTAs, active states |
| `--accent-soft` | `#ddf3ea` | `#193126` | Accent backgrounds, badges |
| `--accent-hover` | `#0b5a44` | `#2d8a68` | Button hover state |
| `--accent-focus` | `#b8ddcf` | `#1d4d3c` | Input focus ring |
| `--muted` | `#5b6960` | `#b8c7be` | Secondary text, labels, captions |
| `--surface` | `#f5f8f6` | `#101612` | Input backgrounds, subtle fill |
| `--warn` | `#8a5a00` | `#f0c36e` | Warnings, amber states |

**Do NOT use hardcoded hex values** in components. Always reference a CSS token.
Exception: `.panel.hero-outcomes` uses fixed `#0f6d53` intentionally — it is the solid-green accent panel and should remain the same in both modes.

---

## Typography

**Fonts:**
- Sans-serif: `Barlow` (Google Fonts) — weights 400, 500, 600, 700, 800
- Monospace: `IBM Plex Mono` — weights 400, 500, 600 (used for code, data display)

**Type scale (global utility classes):**

| Class | Size | Weight | Use |
|---|---|---|---|
| `.page-title` | `clamp(1.8rem, 2.4vw, 2.65rem)` | 800 | Page-level H1 |
| `.section-title` | `clamp(1.3rem, 2vw, 1.6rem)` | 800 | Section headings |
| `.page-description` | `0.98rem` | 400 | Hero subhead, muted |
| `.section-description` | `0.94rem` | 400 | Section subhead, muted |
| `.page-kicker` / `.section-kicker` | `0.72rem` | 700 | Label above title, accent color, tracked |

**Kicker labels** are always ALL CAPS with `letter-spacing: 0.22em`. They set context before the title.
Use `.page-kicker` or `.section-kicker` (identical, aliases) — never inline style for this pattern.

---

## Spacing Scale

Reference only — Tailwind utility classes handle spacing. Avoid custom margin/padding unless building a new CSS class.

| Token | Value | Tailwind equiv |
|---|---|---|
| `--radius-sm` | `8px` | — |
| `--radius-md` | `10px` | — (buttons, inputs) |
| `--radius-lg` | `14px` | — (panels, cards) |
| `--radius-xl` | `16px` | — (section cards) |
| `--radius-2xl` | `18px` | — (page hero) |
| `--radius-full` | `9999px` | `rounded-full` |

---

## Shadow Scale

| Token | Use |
|---|---|
| `--shadow-sm` | Subtle lift, button hover |
| `--shadow-md` | Card hover, elevated panels |
| `--shadow-lg` | Modals, drawers, sticky elements |

Shadows are theme-aware (darker in dark mode). Use these tokens, not hardcoded box-shadow values.

---

## Animation

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | `150ms` | Button/link hover transitions |
| `--duration-base` | `220ms` | Panel/background theme transitions |
| `--duration-slow` | `350ms` | Entrance animations, drawer open/close |
| `--ease-default` | `ease` | Standard easing |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful pop (use sparingly) |

**Entrance animations:**
- `.fade-up` — immediate animation on render (hero elements, above-fold content)
- `.observe-fade` + `.is-visible` — scroll-triggered via IntersectionObserver (below-fold cards)
- Always respect `prefers-reduced-motion` — both classes are handled in globals.css

---

## Component Library

### Panels & Cards

| Class | Surface | Border | Radius | Use |
|---|---|---|---|---|
| `.panel` | `--panel` | `--line` | `--radius-lg` | Primary card surface |
| `.subtle-panel` | `--surface` blend | `--line` | `--radius-lg` | Secondary card, nested content |
| `.section-card` | `--panel` | `--line` | `--radius-xl` | Full-width section containers |
| `.stat-card` | gradient | `--line` | `--radius-xl` | Metric display cards |
| `.page-hero` | gradient | `--line` | `--radius-2xl` | Page-top hero block |

**Add `.card-hover` to any card that is clickable/interactive:**
```tsx
<article className="subtle-panel card-hover p-5">
```
This applies: `translateY(-2px)` + `--shadow-md` + accent border tint on hover.

### Buttons

| Class | Background | Use |
|---|---|---|
| `.btn .btn-primary` | `--accent` | Primary CTA (one per section max) |
| `.btn .btn-secondary` | `--surface` + border | Secondary actions |
| `.btn .btn-ghost` | transparent | Tertiary, nav-adjacent actions |

All `.btn` variants have `min-height: 44px` for touch accessibility.
On mobile, primary CTAs should be `w-full sm:w-auto`.

### Hero Aside (trust/quick-facts panel)

```tsx
<aside className="page-hero-aside">
  <p className="page-hero-aside-title">LABEL</p>
  <ul className="page-hero-list">
    <li>Item one</li>
    <li>Item two</li>
  </ul>
</aside>
```

List items get an automatic accent dot via CSS `::before`. No manual bullet markup needed.

### Section Pattern

```tsx
<section className="section-card">
  <p className="section-kicker">CATEGORY LABEL</p>
  <h2 className="section-title">Section heading</h2>
  <p className="section-description">Supporting context.</p>
  {/* content */}
</section>
```

Add `.section-title-accent` alongside `.section-title` to render a green underline bar:
```tsx
<h2 className="section-title section-title-accent">Heading</h2>
```

---

## Navigation (Sprint 1 — not yet built)

Target state (post Sprint 1):
- **Desktop**: Sticky glassmorphic bar — `[Logo + wordmark] | [Nav links, centered] | [Open Workspace CTA]`
- **Mobile**: Hamburger → slide-in right drawer
- Active link: accent dot or underline via `usePathname`
- "Open Workspace" is always a `.btn.btn-primary` in the nav, visible at every scroll depth

---

## Responsive Breakpoints

Follow Tailwind defaults: `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`.

Mobile-first rules:
- Default (no prefix) = mobile
- `sm:` prefix = tablet and up
- Stacked → grid transitions happen at `md:` minimum
- Primary CTAs: `w-full sm:w-auto` on any hero/section
- Minimum touch target: `44px` height (enforced by `.btn`)

---

## Dark Mode

Theme is toggled by adding `data-theme="dark"` to `<html>` via `ThemeToggle`.
Stored in `localStorage` under key `mv-theme` (migrated from `tnm-theme`).
Default: system preference via `window.matchMedia("(prefers-color-scheme: dark)")`.

All component transitions use `var(--duration-base) var(--ease-default)` — do not hardcode `220ms ease`.

---

## Do / Don't

| Do | Don't |
|---|---|
| Use CSS tokens for all colors | Hardcode hex values in components |
| Use `.card-hover` on clickable cards | Write custom hover box-shadow inline |
| Use `.fade-up` on hero elements | Use `opacity-0` without an animation class |
| Use `w-full sm:w-auto` on mobile CTAs | Use fixed-width buttons on small screens |
| Use `.section-kicker` + `.section-title` together | Style headings inline with Tailwind only |
| Use `min-h-[44px]` on all interactive elements | Create touch targets smaller than 44px |
| Reference `.btn-primary` for one CTA per section | Stack 3+ primary CTAs at the same level |
| Test both light and dark mode before committing | Assume light mode only |

---

## Known Leftovers / Tech Debt

- `app/app/*` pages: authenticated `/app` sub-app has its own layout and nav — Sprint upgrades focus on public pages first
- Watermark: `site-watermark` references `/assets/rig-logo-watermark.svg` (RIG branding) — intentional since MilVector is a RIG product; update if/when MilVector gets its own watermark asset
- `localStorage` key migrated from `tnm-theme` → `mv-theme` in Sprint 0; backward-compat read for existing users included in ThemeToggle
