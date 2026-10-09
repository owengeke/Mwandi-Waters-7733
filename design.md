# Mwandi Waters — Design

Water utility management platform for Kenya (KES). Web-first operator console (desktop shell loads the same UI). Visual direction: **calm infrastructure** — precise, data-dense, trustworthy. Think utility control room, not marketing site. Water is expressed through a single blue, faint contour lines in the background, and generous whitespace; never through clip-art droplets or gradients.

## Brand & Colors

CSS variables in `packages/web/src/web/styles.css`. Theme is class-based (`.dark` on `<html>`), persisted in `localStorage["mw-theme"]` (`light` | `dark` | `system`), applied pre-paint by an inline script in `index.html`.

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| background | #FAFCFF | #0B132B | Page background |
| card | #FFFFFF | #1E293B | Cards, tables, sidebar |
| foreground | #0B1B2E | #E6EEF7 | Body text |
| primary | #0077B6 | #3BA4E0 | Buttons, active nav, links, focus ring |
| primary-foreground | #FFFFFF | #06101F | Text on primary |
| muted | #EEF4FA | #16213A | Table headers, subtle fills |
| muted-foreground | #5B6B7F | #94A3B8 | Secondary text, labels |
| border | #DCE6F0 | #2A3A52 | Hairlines |
| success | #12805C | #34D399 | PAID, ACTIVE, INSTALLED |
| warning | #B45309 | #FBBF24 | PARTIALLY_PAID, PENDING_*, SUSPENDED |
| destructive | #C62828 | #F87171 | OVERDUE, REJECTED, DISCONNECTED |

Dark primary is lifted from #0077B6 for WCAG contrast on #1E293B.

## Typography

| Role | Font | Notes |
|------|------|-------|
| Display / headlines | **Figtree** 600–800 | `font-display`. Tight tracking (-0.02em) on large sizes |
| Body / inputs / tables | **Open Sans** 400–600 | `font-sans` (default) |
| Identifiers | **IBM Plex Mono** 500 | `font-mono` — ACC-XXXX, MTR-XXXX, REQ-XXXX, INV-XXXXX, M-Pesa receipts (QX891234AB). Use the `<Code>` component |

Money: always `KES 1,234.50` via `formatKES()` (en-KE locale, 2 dp), tabular numerals (`tabular-nums`), right-aligned in tables.
Dates: `9 Oct 2026` (en-KE, day-first). Phones: `+254 712 345 678`.

## Spacing & Shape

- 4px base grid; page padding 24–40px; card padding 20–24px.
- Radius: 10px cards, 8px inputs/buttons, full pills for status badges.
- Hairline 1px borders over heavy shadows. Shadows only on overlays.

## Components

- **AppShell**: fixed 248px left sidebar (brand, nav, theme switcher at foot), content max-width 1280px. Collapses to top bar + sheet on < 1024px.
- **ThemeSwitcher**: 3-way segmented control (Light / Dark / System) with lucide icons; compact icon-cycle variant for the mobile top bar.
- **StatusBadge**: pill, tinted bg (12% alpha) + solid text, maps every enum value to success / warning / destructive / neutral / info.
- **DataTable**: muted header row, uppercase 11px labels, 1px row dividers, mono identifiers, right-aligned KES.
- **StatCard**: label (muted, 12px uppercase), Figtree value (28–32px), small caption.

## Motion

One staggered fade-up on page mount (cards then table), 40ms stagger, 300ms ease-out. Theme switch transitions colors 200ms. Respect `prefers-reduced-motion`.

## Pages (v1)

| Route | Purpose |
|-------|---------|
| `/` | Dashboard: collections this month, outstanding balances, overdue, open installation requests |
| `/installations` | Installation request pipeline (REQ-XXXX) |
| `/clients` | Client accounts (ACC / MTR) and balances |
| `/invoices` | Invoices, KES 150 per unit |
| `/payments` | Payment ledger with M-Pesa receipts |
