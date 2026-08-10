# Prism Redesign — Implementation Guide

This document is for the developer implementing the approved Prism redesign. Send it together with the 7 approved screenshots. The screenshots show *what* the 7 covered screens should look like; this document explains the *rules* behind them, so any screen not shown — or any new screen built later — can be built consistently without re-asking a design question every time.

## 1. What's in this handoff

| File | Purpose |
|---|---|
| **The 7 screenshots** (sent separately) | The literal, pixel-level target for those 7 screens. If this document and a screenshot ever disagree, the screenshot wins. |
| `docs/woodside/tokens.css` | Copy-paste CSS custom properties — colors, fonts, radius, spacing. Drop into the app's global stylesheet / theme file. |
| `docs/woodside/DESIGN.md` | The fuller brand-system reference extracted from woodsidesolutions.com — use it for anything the 7 screens don't cover. |
| **This document** | The rules connecting the two, plus a screen-by-screen change list. |

## 2. Fonts

Two typefaces, each with one job. Install:

```
npm install @fontsource/newsreader @fontsource/public-sans
```

Import once, at the app root:

```js
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/400-italic.css"; // only needed if a pull-quote style is ever used
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
```

- **Newsreader** (`--font-serif`) — page titles (h1), module/card titles, and the AI chat message text. Nothing else.
- **Public Sans** (`--font-sans`) — literally everything else: nav, body copy, buttons, table cells, timestamps, chips, inputs.

**Never mix these two roles.** The moment body copy goes serif, or a button label goes serif, the system stops reading as "Woodside" and starts reading as a wedding invitation. The serif/sans contrast only works if it's used exactly this narrowly.

## 3. Color rules

Full palette is in `tokens.css`. The rule that matters more than the hex values:

- **Two neutral surfaces, one accent.** Cream (`--cream`/`--raised`/`--sunken`) is the default app canvas. Navy (`--navy`/`--navy-raised`) is the sidebar (always) and the main canvas when dark mode is on. `--rust` is the *only* chromatic accent in the whole system.
- **Where rust is allowed:** the active-nav-item left indicator, the user-avatar circle, and the spinner/loading-ring accent on empty states. That's it.
- **Where rust is *not* allowed:** button fills, card borders/rails, status labels, icons. If you find yourself reaching for rust anywhere else, use `--ink` (navy) or a semantic color instead.
- **`--good` / `--good-hover`** is a separate, deliberately-distinct dark green reserved for affirmative primary actions — "Run…", "Save…". It is not the brand accent; don't use it for anything decorative.

## 4. The "don't make it look AI-generated" list

This is the part that took a few rounds to get right — these are concrete patterns we removed during design review, kept here so they don't creep back in on a screen built later:

- ❌ **No colored top-border / accent rail on cards.** An earlier draft put a rust bar across the top of every module card — cut it. Cards get a plain 1px hairline border, nothing else.
- ❌ **No numbered circular badges** (①②③ or `01` `02` `03` in colored pills) on module cards. The current module grid doesn't number stages — don't add numbering unless a screen is genuinely a linear step-by-step wizard.
- ❌ **No fully-rounded ("pill") buttons or chips.** Nothing in this system exceeds `--radius-chip` (6px). A pill shape reads as generic SaaS-template, not as this product.
- ❌ **No drop shadows, anywhere.** Depth comes from a 1px hairline border and background-color change only.
- ❌ **No colored "status chip" backgrounds.** Status ("Not started" etc.) is a plain small-caps text label in `--ink-faint`, not a colored pill/badge. See §7.1.
- ✅ **Do differentiate buttons by role, not just color** — see §6.3. A screen with five identical rounded-navy buttons is the tell; five buttons that each look like what they *do* is the fix.

## 5. Layout & spacing

- Base unit 4px; use the `--sp-*` scale in `tokens.css` rather than one-off pixel values.
- Card interior padding: `--sp-md` to `--sp-lg` (16–24px).
- Sidebar is fixed-width (~208–264px depending on final app grid), always on `--navy-sidebar`, regardless of whether the main canvas is in light or dark mode — the sidebar never changes with the theme toggle.
- Module grids: 3-up or 4-up on desktop depending on item count (6 modules → 3-up, 10 modules → 4-up); collapse to fewer columns, not smaller cards, on narrower viewports.

## 6. Component specs

### 6.1 Module card
```css
.module-card {
  background: var(--raised);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-card);
  padding: var(--sp-md) var(--sp-md);
}
.module-card h3 { font-family: var(--font-serif); font-weight: 500; font-size: 14.5px; }
.module-card p { font-family: var(--font-sans); color: var(--ink-soft); font-size: 11.5px; }
.module-card .status { font-family: var(--font-sans); font-size: 9.5px; font-weight: 700;
  letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-faint); }
```
Dark-mode variant swaps `--raised`→`--navy-raised`, `--hairline`→`--navy-hairline`, text colors → the `--inverse-*` set. No other change.

### 6.2 Status label
Plain text, not a badge:
```css
.status { font-size: 9.5px; font-weight: 700; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--ink-faint); }
```
No background, no border, no pill.

### 6.3 Buttons — four distinct roles, not one button with color swaps

```css
.btn { font-family: var(--font-sans); font-size: 11.5px; font-weight: 600;
  padding: 7px 13px; border-radius: var(--radius-button); border: 1px solid transparent; }

.btn-solid   { background: var(--good); color: #f3f6f1; }      /* Run…, Save… — primary/affirmative only */
.btn-solid:hover { background: var(--good-hover); }
.btn-line    { background: transparent; border-color: var(--ink); color: var(--ink); } /* secondary action */
.btn-text    { background: none; border: none; color: var(--ink-soft); font-weight: 700;
  font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; } /* lowest-emphasis action */
.btn-off     { background: transparent; border-color: var(--hairline); color: var(--ink-faint);
  cursor: not-allowed; } /* disabled */
```
`btn-solid` is reserved for the one primary/confirming action per screen (Run analysis, Save, Run configuration). Every other action on the same screen should be `btn-line` or `btn-text` — don't make everything solid.

### 6.4 Data table (Vendor Award / SOW scoring template)
- Header row: uppercase, letter-spaced, `--ink-faint`, bottom border **1px `--ink`** (not a filled header background).
- Body rows: 1px `--hairline` bottom rule between rows, no zebra striping.
- Numeric columns (weight %): right-aligned, `font-variant-numeric: tabular-nums`, `font-weight: 600`.
- Total row: no bottom rule, top border **1px `--ink`**, bold.

### 6.5 Chat bubbles (Sprout)
```css
.bubble-user { background: var(--good-hover); color: #f3f6ee; border-radius: 10px 10px 3px 10px; }
.bubble-ai   { background: var(--sunken); border: 1px solid var(--hairline); color: var(--ink);
  font-family: var(--font-serif); font-size: 14.5px; border-radius: 10px 10px 10px 3px; }
```
The AI bubble is the one place in the whole *chat surface* that goes serif — it's the product's voice. Suggestion chips and the input bar stay sans, `--radius-chip` (6px), never pill.

### 6.6 Empty / pending state (Configuration)
- Bordered panel (`--hairline`, `--radius-card`), centered content, generous padding (`--sp-xxl`+).
- Loading indicator: a simple ring/spinner using `--rust` as the active arc color — the one legitimate non-nav use of the accent, because it's a temporary system-status signal, not decoration.

## 7. Screen-by-screen changes

For each screen: what changes from the current app to the approved redesign.

### 7.1 Dashboard — "Get Started" view
- Sidebar: swap current maroon/brown fill for `--navy-sidebar`; active item gets a 2px `--rust` left indicator instead of a full color-fill highlight.
- Header row: "+ New project" becomes `btn-line` (outline), "Load demo data" becomes `btn-text` (plain text, no box) — currently both look like the same button; they shouldn't.
- Section label ("Get started — jump to any stage…") : small-caps `--ink-faint`, no icon.
- Cards: apply §6.1 exactly — remove any icon glyph per card, remove any colored top border, title in serif.
- Status: replace the current colored "Not started" badge with the plain text label from §6.2.

### 7.2 Dashboard — "Prism Modules" view
- Same rules as 7.1, applied to the 10-card grid (4-up).
- No numbering on cards (see §4).

### 7.3 Vendor Award / SOW
- Table: apply §6.4. In particular, remove any filled/colored table-header background if present — replace with the bottom-rule treatment.
- "+ Add criterion" → `btn-text`.
- "Save" → `btn-solid` (this is the one affirmative action on the screen).
- Page title "Vendor Award / SOW" in serif h1; "Scoring template" sub-heading also serif, one size down.

### 7.4 RFP Analysis
- Vendor-name input + "+ Upload proposal": input is plain bordered field (`--hairline`, `--radius-card`); upload is `btn-line`, not solid.
- Empty state ("No vendor proposals uploaded yet"): plain centered text between two dashed hairline rules — no icon, no illustration.
- Action row: "Run RFP analysis" = `btn-solid` (the one primary action), "Compare vendors" = `btn-line`, "Check compliance" = `btn-off` (disabled) until proposals exist.

### 7.5 Configuration
- Apply §6.6 for the "not yet generated" empty state.
- "Run configuration" = `btn-solid`, centered under the description text.

### 7.6 Sprout AI assistant (chat)
- Apply §6.5 for bubbles.
- Top-right toggle chips ("Dark", "Sprout"): bordered, `--radius-chip`, icon + label, `--ink-soft` text — not filled/solid buttons.
- Suggestion chips: bordered `--raised` background, `--radius-chip`, never pill.
- Input bar: paperclip icon button (bordered square, `--radius-chip`) + text input + send button (`--good-hover` fill, `--radius-chip`, arrow icon) — send button is the one solid-fill element in the bar.

### 7.7 Dashboard — dark theme
- This is the dark-mode state of 7.2, not a separate screen: sidebar stays `--navy-sidebar` (unchanged — it's already dark in light mode), main canvas switches `--cream`→`--navy`, cards switch `--raised`/`--hairline`→`--navy-raised`/`--navy-hairline`, all text switches to the `--inverse-*` set.
- Nothing else changes — same grid, same copy, same button roles. Dark mode is a token swap, not a redesign.

## 8. QA checklist before calling a screen "done"

- [ ] Only Newsreader on: page h1, card/module titles, chat AI-bubble text. Everything else is Public Sans.
- [ ] `--rust` appears only on: active-nav indicator, avatar, loading-ring accent. Nowhere else.
- [ ] No element has a border-radius greater than `--radius-chip` (6px). No pills.
- [ ] No `box-shadow` anywhere except a visible focus ring on keyboard focus.
- [ ] Every card has a plain 1px hairline border and nothing else decorating its edge (no top rail, no left rail).
- [ ] Status is a text label, not a colored badge.
- [ ] Each screen has at most one `btn-solid` (the primary/affirmative action) — every other button is outline, text, or disabled.
- [ ] Dark-mode toggle only changes canvas/card/text tokens — layout, copy, and button roles are identical to light mode.
