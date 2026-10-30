# Squeek Mode design

## Overview

Squeek Mode is a compact workbench for people bringing their own chat model key. Its single visual idea is a quiet, olive-and-ivory ASCII habitat accompanying real chat workflow states. The interface puts the conversation first; the hamster supplies character without pretending to narrate a model’s private thinking.

The source of truth is `src/style.css`. `src/App.tsx` composes the page; `Habitat`, `Gallery`, `Modal`, `Receipt` and `Icon` are separate components. There is one light theme, no marketing carousel and no additional route system.

## Colors

The palette uses hex primitives with semantic aliases in `:root`:

| Semantic token | Value | Role |
| --- | --- | --- |
| `--bg` | `#f4f3eb` | Page |
| `--surface` | `#fcfcf8` | Chat, fields, dialogs |
| `--surface-muted` | `#e9e9dd` | Neutral hover and code samples |
| `--border` | `#d7d9c9` | Structural separators |
| `--text` | `#263421` | Body text and headings |
| `--muted` | `#626958` | Supporting text; darkened after contrast review |
| `--accent` | `#3c542c` | Primary action fill |
| `--accent-hover` | `#2e4321` | Primary hover |
| `--accent-soft` | `#e7edda` | User messages and selected scene |
| `--creative` / `--creative-soft` | `#795b1f` / `#f4ebd3` | Creative route badge |
| `--error` | `#9b3933` | Recoverable error text and clear confirmation |
| `--focus` | `#465c2e` | Keyboard outline |

The character canvas uses `#4b5c3b` on `#edf0e2`. Source status dots use the green primitive `#627a3b`, accompanied by text. The separate amber route badge is also labeled, so color is never the only route signal.

Measured solid pairs: body on page 11.82:1; secondary on page 5.13:1; secondary on selected green 4.76:1; primary-button text/fill 8.18:1; ASCII/background 6.28:1; creative badge 5.31:1; error on surface 6.75:1. These were computed from actual source colors and corroborated by rendered audits. They do not establish every possible custom platform rendering.

## Typography

`--font` is locally bundled DM Sans, then Arial and sans-serif. The local variable file is `src/assets/dm-sans-latin.woff2`; CSS declares the 400–700 weight range and uses 400, 500 and 600. `--mono` is Courier New/monospace for ASCII, receipts, scene indexes and commands. The mixed font system reflects the requested ASCII habitat rather than applying monospace to all prose.

The six semantic sizes are 12, 14, 16, 20, 24 and 36px at the normal 16px root. Headings use 600 weight, display line-height 1.15 and tracking −0.045em; mobile display is 24px with −0.035em tracking. Body uses line-height 1.5; answers use 1.65, pre-wrap and anywhere wrapping. Labels are generally 14px, metadata 12px. Inputs remain 16px on mobile. Dynamic counters use tabular numbers.

ASCII is a decorative character image with an accessible caption. Its drawing font uses pixels so enlarging text does not overflow the page; the associated labels and all functional text still enlarge. The desktop drawing is 12px at 1440, clamped below that with a 9px intermediate adaptation. Mobile uses a smaller 44×17 canvas at 12px, and 10px below 370px. The gallery uses 10px on phones and 9px below 370px.

Headings use balanced wrapping. Prose uses pretty wrapping. Long hashes and response text remain available in full and wrap, without ellipsis. The local DM Sans file loaded successfully in the rendered checks.

## Layout

The shell is at most 1440px wide with 48px desktop side padding, 28px below 1100px, 24px below 850px, and 16px below 540px (12px below 370px). The header and composer can wrap their controls, including when root text is enlarged to 200%.

Spacing tokens define 4, 8, 12, 16, 24, 32 and 48px steps. The desktop workbench is a two-column grid, `1fr 1.04fr`, with a 32px gap (24px below 1100px). Chat is left; habitat, route controls and source status are right. The conversation is an independently scrollable 350px region. Empty-state content does not postpone the composer.

At 850px and below, chat becomes a full-width first row. Its conversation is 320px high; habitat follows with controls in two columns where space permits. At 540px and below, the conversation is 260px and all secondary sections stack. The smaller ASCII canvas replaces the desktop canvas. The gallery navigation text collapses, the skill control remains an explicitly named icon button, and the gallery remains reachable below the habitat. The product and Start chatting action were observed above the fold at 390×844.

Dialogs use `min(520px, viewport − 32px)` width, or 740px for the gallery. They scroll internally within the dynamic viewport. At narrow widths, receipt rows stack their term and value; gallery choices become a single column. No full-width edge-to-edge primary controls or persistent floating controls cover chat content.

Checked widths: 320, 390, 850 and 1440 in Chromium and WebKit. Root text enlargement was tested separately from viewport reflow; browser-native zoom and physical iOS devices were not tested.

## Elevation & depth

Surfaces are flat. One-pixel borders separate chat, fields and habitat; tonal backgrounds distinguish messages, drawings and selection. There are no card shadows, gradients, or nested decorative cards. Dialogs use the browser’s top layer and a `rgb(38 52 33 / .35)` backdrop with a 3px blur. This blur is optional decoration; the dialog’s solid surface carries text contrast.

## Shapes

The chat surface uses a 10px radius; habitat/composer 8px; dialogs 12px; primary, secondary and key controls 6px; icon controls 5px; route badges 4px. Structural borders stay one pixel. The circular empty-state hamster background is an illustration, not a control.

## Components

| Component or pattern | Source | Behavior and variants |
| --- | --- | --- |
| Chat/composer | `src/App.tsx` | Empty, checking, waiting, streaming, complete, error and cancelled states; one synchronous in-flight guard; Enter/Shift+Enter; Stop; confirmation before clearing; JSON export |
| Buttons | `src/style.css` | `.primary-button`, `.secondary-button`, `.text-button`, `.icon-button`; hover, visible focus, pressed and disabled states; labeled icon utilities |
| `Modal` | `src/Modal.tsx` | Native `dialog.showModal()`, native focus containment/background inertness, Escape and backdrop dismissal, initial input focus when requested, focus return to trigger |
| Key form | `src/App.tsx` | Password field, consent checkbox, actionable inline validation, connect/forget actions; no verification request on connect |
| `Habitat` | `src/Habitat.tsx` | Observable phase, optional move and source/cooldown status select scenes; pause and sound controls; muted by default |
| `Gallery` | `src/Habitat.tsx` | Explicitly labeled illustration previews; group filter, 28 selectable scenes, pause control |
| Scene canvas | `src/scenes.ts` | 68×25 desktop and 44×17 compact ASCII character canvases; scene-specific zone, pose and prop; hidden from assistive technology in favor of captions |
| `Receipt` | `src/Receipt.tsx` | Semantic definition list, full wrapping hashes, fixed-domain explorer links, freshness/cache labels and replay inputs |
| `Icon` | `src/icons.tsx` | Small local SVG set, `currentColor`, consistent 1.6px strokes, decorative `aria-hidden` glyphs |

Keyboard focus uses a 2px outline offset by 4px (2px for fields), and uses Highlight in forced-colors mode. Controls are native buttons, inputs, selects and links; destructive clear requires a dialog. Routine completion/export notices use one polite status region. Streaming tokens are not repeatedly announced, and provider errors have visible recovery text.

Visual character frames update every 700ms and scene choices every 5.6 seconds. These intervals never drive request progression. Autoplay stops when reduced motion is enabled or the user pauses it. CSS motion is confined to `prefers-reduced-motion: no-preference`: 120ms control transitions, pressed scale 0.96, and the waiting cursor. The application enters sleep after 90 seconds with no request/source check; this timer does not delay or schedule a model call.

## Do’s and don’ts

- Reuse the existing semantic tokens and six text sizes. A new error should use `--error`; a new normal surface should not borrow the creative color.
- Keep one prominent primary action per task view. Put the input and action before secondary explanations on phones.
- Keep full receipt values selectable and wrap them. Do not replace them with shortened identifiers in the inspection view.
- Map animation to observable events or label it as a gallery preview. Never use fake reasoning, arbitrary progress percentages or timed answer delays.
- Preserve the native dialog and controls rather than introducing a second interaction system.
- A future view should reuse the shell, `Modal`, button classes and 16/24/32px grouping. Add it through an explicit navigation action or static-compatible hash route; do not require server rewrites.

The design review’s findings, corrections, guide coverage and unperformed checks are recorded in `artifacts/validation.md`. Better Interface and Impeccable attributions and licenses are in the README and `licenses/`.
