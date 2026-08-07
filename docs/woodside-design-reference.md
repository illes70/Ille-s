# Woodside Solutions – Design Reference

Source: https://woodsidesolutions.com/ (captured via screenshots on 2026-08-07 — colors below are visually estimated, not lifted from CSS; refine with exact hex values if the stylesheet ever becomes available).

This is the design language we want to reuse for future products (e.g. the Prism dashboard) so they read as considered, editorial, human-made work — not as a default AI-generated SaaS template.

## Why it doesn't look "AI-generated"

The things a generic AI-built UI usually gets wrong, that this site gets right:

- **No gradients, no glassmorphism, no heavy drop-shadow cards.** Everything is flat, with hairline 1px borders instead of shadow-elevation.
- **A real serif is doing the heavy lifting on headlines.** Not a system sans stack for everything — the serif/sans pairing alone reads as "designed," not "scaffolded."
- **Warm off-white, not stark white or a blue-tinted gradient background.**
- **One restrained accent color** (a muted rust/terracotta), used sparingly — only for eyebrow labels and small accents — never as a dominant UI color, never as a button-fill gradient.
- **No decorative icon sets or emoji.** Hierarchy comes from type scale and whitespace, not iconography.
- **Alternating full-bleed sections** (cream → dark navy → cream) give the page rhythm like a printed report, instead of an endless scroll of identical white cards.
- **Numbers and stats are presented plainly** (big number, small caption) instead of inside icon-badged stat "widgets."
- **Generous, uneven whitespace** — sections breathe at 80–120px+, hero content is asymmetric (text block + offset floating card) rather than centered/symmetric grid layouts.

## Color palette (estimated)

| Role | Approx. hex | Usage |
|---|---|---|
| Cream / warm background | `#F7F4EE` | Default page background |
| Deep navy (near-black) | `#0F1B2B` | Headline text, nav text, primary button fill, full-bleed dark sections |
| Rust / terracotta accent | `#A85A32` | Eyebrow labels (small-caps overline text), step numbers, thin accent borders |
| Body gray | `#5C6570` | Paragraph copy on light backgrounds |
| Hairline border | `#E4E0D8` | Card borders, dividers — always 1px, never shadowed |
| White (on dark navy) | `#FFFFFF` | Headings/body on dark sections |

Rule of thumb: **two neutrals (cream + navy) + one accent**. Do not add a second accent color or a saturated brand blue/purple.

## Typography

- **Headings:** editorial serif, moderate contrast (stroke weight varies but isn't decorative/display-only) — think Tiempos Headline / GT Sectra / Canela class. Tight leading, dark navy or white.
- **Body, nav, buttons, labels:** clean grotesk sans (Inter / Söhne / Neue Haas class).
- **Eyebrow / overline labels:** sans, uppercase, letter-spaced, small (11–12px), rust accent color. Example: "ENTERPRISE AGENTIC AI FOR SAP® & GOOGLE CLOUD", "STEP 1", "PROPRIETARY ARCHITECTURE", "CASE STUDY".
- **Pull quotes:** italic serif, larger than body, used sparingly (one per page section max).

Never fall back to a single system-font stack for both headings and body — the serif/sans contrast is load-bearing for the "not AI" feel.

## Layout patterns

1. **Hero:** left-aligned serif headline + supporting paragraph; a dark-navy floating card sits offset to the right with a short checklist (✓ items), two CTAs below (filled navy primary + outline secondary), then a centered italic pull-quote, then a 4-up plain stat row.
2. **Full-bleed dark section ("in practice" / narrative):** navy background, white serif heading, a short narrative paragraph (concrete scenario, not marketing fluff), followed by a 3-column technical detail row in small sans caps.
3. **Numbered step cards:** 3 cards side by side, thin top border in accent color, "STEP N" eyebrow, serif card title, gray bullet list, single CTA button below the row (not per-card).
4. **Industry/segment list:** 4-column plain list (heading + 2–3 line description + "Explore →" text link), no icons, no card chrome.
5. **Case study / social proof:** centered, generous whitespace, one CTA.
6. **Closing full-bleed navy band:** short, large centered serif line — a single statement, not a form.

Sections strictly alternate background (cream / navy / cream / navy...) to create visual rhythm without needing card borders everywhere.

## Components

- **Primary button:** navy fill, white text, rounded-rect (not fully pill, not sharp corners — moderate radius, ~4–6px), no gradient, no shadow.
- **Secondary button:** outline only, navy or white border depending on background, transparent fill.
- **Text link ("Explore →", "See a case study"):** plain text + arrow, no button chrome.
- **Card:** hairline border, no shadow, optional accent-colored top border for numbered/stepped content.
- **Stat block:** big number (sans or serif, bold) + small gray caption underneath, no icon, no card wrapper — just spaced in a row.

## Voice/tone (copy)

Confident, technical-executive register. Concrete scenarios over adjectives ("A supplier shipment runs late, threatening a contract penalty clause..." rather than "Our AI helps you manage risk"). Short declarative headline sentences. Product concepts get trademarked-style names (Agentic Trident Framework™, Silicon Identity™) treated as proper nouns throughout.

## Applying this to Prism

The current Prism dashboard screenshots (dense card grids, generic sans-only type, uniform drop-shadow cards, no accent-color discipline) are exactly the pattern this reference should replace. When redesigning Prism:

- Swap the flat white/gray card-grid dashboard for sections with real hierarchy: a serif headline for the page/module title, cream background, hairline borders instead of shadows.
- Pick one rust/terracotta-class accent and use it only for status labels/eyebrows — not for every active state or icon.
- Replace icon-heavy module tiles with the numbered-step or plain-list pattern above where it fits (e.g. RFP → Analysis → Configuration → Development → Testing reads naturally as numbered steps, similar to Woodside's "Strategy, fast deployment, and ROI" 3-step section).
- Keep dark-navy as the "serious" surface (sidebar, modals, primary buttons) rather than introducing a separate brand blue/purple.
