---
version: alpha
name: Woodside-Solutions-design-analysis
description: "An enterprise-AI marketing canvas built on warm cream (#F7F4EC) paper rather than white, deep near-black navy (#101B2B) for type and full-bleed narrative sections, and a single restrained rust/terracotta accent (#A1552E) reserved for eyebrow labels and step numbers. Headlines run in an editorial serif (Newsreader stand-in) against a clean grotesk body (Public Sans stand-in) — that pairing, not a color trick, is what keeps the system from reading as a generic AI-tool template. Cards carry hairline 1px borders, never shadows; sections alternate cream and full-bleed navy like pages in a printed report; numbers are stated plainly, without icon badges."

colors:
  primary: "#a1552e"
  primary-soft: "#c98a5f"
  on-primary: "#fbf9f4"
  ink: "#101b2b"
  ink-muted: "#5c6570"
  ink-subtle: "#8b9086"
  canvas: "#f7f4ec"
  surface-1: "#efe9db"
  surface-raised: "#fbf9f4"
  inverse-canvas: "#101b2b"
  inverse-surface-1: "#172542"
  inverse-ink: "#fbf9f4"
  inverse-ink-muted: "#aeb6c9"
  hairline: "#dfd8c6"
  hairline-inverse: "#2b3a56"
  semantic-success: "#3c6e4a"
  semantic-warning: "#93650f"
  semantic-error: "#b3412c"

typography:
  display-xl:
    fontFamily: Newsreader
    fontSize: 60px
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: -0.01em
  display-lg:
    fontFamily: Newsreader
    fontSize: 40px
    fontWeight: 500
    lineHeight: 1.14
    letterSpacing: 0
  headline:
    fontFamily: Newsreader
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0
  card-title:
    fontFamily: Newsreader
    fontSize: 19px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0
  pull-quote:
    fontFamily: Newsreader
    fontSize: 22px
    fontWeight: 400
    fontStyle: italic
    lineHeight: 1.45
    letterSpacing: 0
  body-lg:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  body:
    fontFamily: Public Sans
    fontSize: 14.5px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body-sm:
    fontFamily: Public Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  stat-number:
    fontFamily: Public Sans
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0
  button:
    fontFamily: Public Sans
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0
  eyebrow:
    fontFamily: Public Sans
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0.09em
    textTransform: uppercase

rounded:
  none: 0px
  xs: 2px
  sm: 4px
  md: 6px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 112px

components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 12px 20px
  button-outline:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 12px 20px
  button-outline-inverse:
    backgroundColor: transparent
    textColor: "{colors.inverse-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 12px 20px
  text-link:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: 0px
  card-hairline:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: 24px
  card-step:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: 24px
    borderTop: "2px solid {colors.primary}"
  card-inverse:
    backgroundColor: "{colors.inverse-surface-1}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: 24px
  stat-block:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.stat-number}"
    rounded: "{rounded.none}"
    padding: 0px
  status-chip:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  text-input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: 9px 12px
  data-table:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: 13px 10px
---

## Overview

Woodside Solutions' marketing canvas reads as an editorial report, not a SaaS landing template. The dominant surface is `{colors.canvas}` warm cream (#f7f4ec) — never stark white — with `{colors.inverse-canvas}` deep navy-black (#101b2b) used for full-bleed narrative sections and the app chrome (sidebar, primary buttons). One accent, `{colors.primary}` rust/terracotta (#a1552e), marks eyebrow labels and step numbers and nothing else.

The defining choice is the **serif/sans pairing carrying all hierarchy**: `Newsreader` (or equivalent editorial serif — Tiempos Headline / GT Sectra / Canela class) sets every headline and the occasional italic pull-quote, while `Public Sans` (or equivalent clean grotesk) carries navigation, body copy, buttons, and data. Neither face alone would read as "designed" — the contrast between them is what does it, and it's also the single easiest thing to lose when an AI agent defaults to one sans stack for everything.

Depth is carried by surface change and 1px hairlines, never by drop shadow. Numbered process cards get a single 2px rust top-border as their only "elevation" cue. Sections alternate `{colors.canvas}` and `{colors.inverse-canvas}` full-bleed like signatures in a printed report, giving the page rhythm without needing card chrome everywhere.

**Key characteristics:**
- **Cream, not white.** `{colors.canvas}` #f7f4ec is warm and slightly darker than pure white — it's the base the whole light side of the system sits on.
- **One accent, used sparingly.** `{colors.primary}` rust only appears on eyebrow labels, step numbers, and thin top-borders — never as a button fill or a dominant UI color.
- **Serif headlines, sans everything else.** This pairing alone is what separates the system from a generic AI-tool default (single sans stack, no display face).
- **No shadows.** Hairline borders (`{colors.hairline}` on cream, `{colors.hairline-inverse}` on navy) carry every card and divider.
- **No icon sets, no emoji.** Hierarchy is type scale + whitespace + the rust accent, not iconography.
- **Full-bleed alternation.** Cream → navy → cream sections instead of an endless scroll of identical white cards.
- **Stats stated plainly.** Big sans number + small caption underneath, no icon-badged "stat widget" wrapper.

## Colors

> Source: woodsidesolutions.com, visually inspected from screenshots (2026-08-07). Hex values are estimates from on-screen color-matching, not lifted from the site's CSS — the domain is outside this environment's network allowlist. Treat these as a strong starting point; recheck against a color-picker on the live site before shipping pixel-exact.

### Brand & Accent
- **Rust / Terracotta** (`{colors.primary}`): The single brand accent. Eyebrow/overline labels, step numbers (`STEP 1`, `01`), thin 2px top-borders on numbered cards.
- **Rust Soft** (`{colors.primary-soft}`): Lighter tint of the accent for use on navy backgrounds, where full-strength rust loses contrast.

### Surface
- **Canvas** (`{colors.canvas}`): Default page background — warm cream, not white.
- **Surface 1** (`{colors.surface-1}`): Slightly deeper cream — alternate-row stripes, status-chip fill, subtle section bands on light surfaces.
- **Surface Raised** (`{colors.surface-raised}`): Near-white cream, marginally lighter than canvas — cards and inputs sitting on top of the canvas.
- **Hairline** (`{colors.hairline}`): 1px borders on cream surfaces.
- **Inverse Canvas** (`{colors.inverse-canvas}`): Deep navy #101b2b — full-bleed narrative sections, sidebar/app chrome, primary button fill.
- **Inverse Surface 1** (`{colors.inverse-surface-1}`): One step lighter than inverse canvas — cards floating on a navy section (e.g. the hero's checklist card).
- **Hairline Inverse** (`{colors.hairline-inverse}`): 1px borders on navy surfaces.

### Text
- **Ink** (`{colors.ink}`): Headlines and primary body on cream — near-black navy, not pure black.
- **Ink Muted** (`{colors.ink-muted}`): Secondary body copy, descriptions.
- **Ink Subtle** (`{colors.ink-subtle}`): Tertiary text — captions, disabled, status-chip labels.
- **Inverse Ink** (`{colors.inverse-ink}`): Warm off-white on navy — headlines and body inside dark sections.
- **Inverse Ink Muted** (`{colors.inverse-ink-muted}`): Muted blue-gray on navy — secondary copy inside dark sections.

### Semantic
- **Success** (`{colors.semantic-success}`): Confirmed/primary-action green — reserved for affirmative actions (e.g. "Run analysis", "Save"). Kept separate from the rust brand accent; never used for eyebrows or labels.
- **Warning** (`{colors.semantic-warning}`): In-progress / attention states.
- **Error** (`{colors.semantic-error}`): Destructive or failed states. Not observed on the marketing site; extrapolated to sit tonally between rust and a true red so it doesn't fight the brand accent.

## Typography

### Font Family

- **Display / headline face**: an editorial serif in the Newsreader / Tiempos Headline / GT Sectra / Canela class — moderate stroke contrast, built for both upright headlines and a genuinely italic pull-quote style. This reference implementation embeds **Newsreader** (open-source, Google Fonts) as the closest freely-licensable stand-in.
- **Body / UI face**: a clean, slightly technical grotesk in the Public Sans / Inter / Söhne class, used for navigation, body copy, buttons, table data, and eyebrow labels. This reference implementation embeds **Public Sans** (open-source, Google Fonts, US federal-government publishing typeface — reads as considered and utilitarian rather than "default startup sans").

Never collapse both roles into one sans stack — the serif/sans contrast is load-bearing for the brand feel, not decorative.

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `{typography.display-xl}` | 60px | 500 | 1.08 | Hero headline |
| `{typography.display-lg}` | 40px | 500 | 1.14 | Section-opener headline ("Strategy, fast deployment, and ROI.") |
| `{typography.headline}` | 28px | 500 | 1.2 | Page / module title |
| `{typography.card-title}` | 19px | 500 | 1.3 | Card and step title |
| `{typography.pull-quote}` | 22px | 400 italic | 1.45 | Standalone testimonial/pull-quote — one per section, maximum |
| `{typography.body-lg}` | 16px | 400 | 1.6 | Hero subhead, lead paragraphs |
| `{typography.body}` | 14.5px | 400 | 1.55 | Default body copy, table cells |
| `{typography.body-sm}` | 13px | 400 | 1.5 | Captions, helper text |
| `{typography.stat-number}` | 32px | 700 | 1.1 | Stat blocks ("30%", "$1.8M") — sans, not serif |
| `{typography.button}` | 13px | 600 | 1 | All button and nav labels |
| `{typography.eyebrow}` | 11px | 700 | 1.3 | Overline labels — uppercase, `letter-spacing: 0.09em` |

### Principles

- **Serif is for headlines and pull-quotes only.** The moment body copy or UI chrome goes serif, the system starts to feel like a wedding invitation instead of an enterprise product.
- **Eyebrows are uppercase and tracked**, unlike some enterprise systems that use sentence-case labels — `{typography.eyebrow}` is the one place heavy letter-spacing belongs.
- **Stat numbers are sans-bold, not serif** — they need to read as data, not as a headline.
- **One italic moment per section, at most** — the pull-quote style loses its weight if overused.

## Layout

### Spacing System

- Base unit: 4px.
- Tokens: `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 112px.
- Section vertical padding sits at `{spacing.section}` 112px or more — generous, uneven whitespace is part of the editorial feel.
- Card interior padding: `{spacing.lg}` 24px.

### Grid & Composition

- Hero is **asymmetric**: a left-aligned text block paired with a navy card offset to the right, not a centered/symmetric layout.
- Numbered step content (process, pipeline) renders as 3-up cards or as a single vertical numbered list when the sequence is long — never as an icon-grid of unrelated tiles.
- Segment/category lists (e.g. "four industries") run as a plain N-up column list: heading + 2–3 line description + text link. No card chrome, no icons.
- Stat rows are an evenly-spaced flex/grid row of plain number+caption pairs, 3–4 up.

### Whitespace Philosophy

Sections breathe — `{spacing.section}` and up between major blocks — and the page gets its rhythm from alternating `{colors.canvas}` / `{colors.inverse-canvas}` full-bleed bands rather than from uniform card padding. Content is not dense by design; there's room around every block.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No shadow, no border | Body text, section backgrounds |
| 1 (hairline) | 1px `{colors.hairline}` (or `{colors.hairline-inverse}` on navy) | Cards, table rules, dividers |
| 2 (accent border) | 2px `{colors.primary}` top border | Numbered step cards — the system's only "elevated" treatment |
| 3 (focus ring) | 2px `{colors.primary}` outline, 2px offset | Focused button / input / nav item |

No drop shadows, no glassmorphism, no gradients anywhere in the system.

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Text links, table cells |
| `{rounded.xs}` | 2px | Cards, inputs |
| `{rounded.sm}` | 4px | Buttons |
| `{rounded.md}` | 6px | (reserved; not observed) |
| `{rounded.pill}` | 9999px | Status chips only |

Corners stay small and quiet everywhere except status chips, which are the one fully-rounded shape in the system — that contrast is what makes a chip read as a status pill rather than a button.

## Components

### Buttons

**`button-primary`** — Navy fill, cream text. The default primary CTA everywhere, on both cream and navy backgrounds.
- Background `{colors.ink}`, text `{colors.on-primary}`, type `{typography.button}`, rounded `{rounded.sm}`, padding 12px 20px. No gradient, no shadow.

**`button-outline`** — Outline only, navy border and text. Secondary CTA on cream.
- Background transparent, border 1px `{colors.ink}`, text `{colors.ink}`, rounded `{rounded.sm}`.

**`button-outline-inverse`** — Same shape, cream border/text, for use on navy backgrounds.

**`text-link`** — Plain text + arrow ("Explore →", "See a case study"), no button chrome at all. Used liberally for lower-emphasis actions.

### Cards & Containers

**`card-hairline`** — Default card: 1px `{colors.hairline}` border, `{colors.surface-raised}` background, no shadow.

**`card-step`** — Numbered process card: same as `card-hairline` plus a 2px `{colors.primary}` top border and a `STEP N` eyebrow above the title.

**`card-inverse`** — Card floating on a navy section (e.g. hero checklist card): `{colors.inverse-surface-1}` background, `{colors.inverse-ink}` text, 1px `{colors.hairline-inverse}` border.

### Data

**`stat-block`** — Big `{typography.stat-number}` figure over a `{typography.body-sm}` caption, no wrapper card, arranged in an evenly-spaced row.

**`status-chip`** — Small pill, `{colors.surface-1}` background, `{colors.ink-subtle}` text, `{typography.eyebrow}` styling, `{rounded.pill}`. Neutral by default; swap text color to `{colors.semantic-success}` / `{colors.semantic-warning}` for state, never to `{colors.primary}` (the accent is reserved for brand moments, not status).

**`data-table`** — Hairline row dividers, no zebra striping, numeric columns right-aligned with tabular figures, header row in `{typography.eyebrow}` style with a 1px `{colors.ink}` bottom rule instead of a filled header background.

### Forms

**`text-input`** — `{colors.surface-raised}` background, 1px `{colors.hairline}` border, `{rounded.xs}`, `{typography.body}`. Focus state uses the `{colors.primary}` focus ring (see Elevation level 3).

## Do's and Don'ts

### Do
- Reserve `{colors.primary}` rust for eyebrows, step numbers, and 2px accent top-borders. Nowhere else.
- Pair a real serif (headlines/pull-quotes only) with a grotesk sans (everything else). The contrast is the brand.
- Use `{colors.canvas}` warm cream, never pure white, as the light-mode ground.
- Carry hierarchy with hairline borders and surface changes, not shadows.
- Alternate full-bleed cream/navy sections to create rhythm.
- Use numbered step cards only where the content is a genuine sequence — not as decoration.
- State stats plainly: big number, small caption, no icon badge.

### Don't
- Don't add a drop shadow, gradient, or glassmorphism effect anywhere.
- Don't use the rust accent as a button fill, a background, or a dominant UI color.
- Don't set body copy or UI chrome in the serif face — it's for headlines and pull-quotes only.
- Don't decorate cards or list items with icon sets or emoji.
- Don't default to a single sans stack for both display and body — that's the single fastest way back to a generic AI-tool look.
- Don't fully round buttons into pills — that shape is reserved for status chips.
- Don't stack more than one italic pull-quote per section.

## Responsive Behavior

Not directly observed — the live site could not be inspected from this environment (network egress to woodsidesolutions.com is blocked). Recommended defaults, consistent with the desktop-first density seen in the screenshots:

| Name | Width | Key changes |
|---|---|---|
| Desktop | 1280px+ | Full asymmetric hero, 3–4 up card/stat rows |
| Tablet | 768–1279px | Hero stacks (text above card); card rows go 2-up |
| Mobile | <768px | Single column throughout; `{typography.display-xl}` scales down toward `{typography.headline}` size; sidebar/nav collapses behind a menu control |

## Iteration Guide

1. Reference components by their `components:` token name (`button-primary`, `card-step`, `status-chip`, …) so changes stay traceable back to this file.
2. Default body text to `{typography.body}` on `{colors.ink}` — don't introduce a second body face.
3. When adding a new section, decide `{colors.canvas}` or `{colors.inverse-canvas}` — the two-surface alternation is the rhythm; don't add a third background color.
4. Treat `{colors.primary}` as scarce — eyebrows, step numbers, top-borders, focus rings. Anything more is drift toward a generic accent-heavy template.
5. When a screen needs status (not-started / in-progress / done), use `status-chip` with semantic text color — never repurpose the rust accent for status.
6. Numbered markers (`01`, `STEP 1`) are only correct where the underlying content is actually ordered (a real pipeline/process) — don't add them decoratively.

## Known Gaps

- Colors and type sizes are estimated from screenshots, not read from the live stylesheet — this environment cannot reach woodsidesolutions.com (blocked by network egress policy). Re-verify hex values with a color picker against the live site before treating them as final.
- The exact production typefaces are unconfirmed — this file documents Newsreader/Public Sans as the closest open-source stand-ins for the serif/sans pairing actually observed, not a confirmed match to Woodside's real font license.
- Form validation, error, and empty states beyond what appeared in the captured screenshots are not documented.
- Motion/interaction behavior (hover, transition timing) was not observable from static screenshots and is not documented here.
