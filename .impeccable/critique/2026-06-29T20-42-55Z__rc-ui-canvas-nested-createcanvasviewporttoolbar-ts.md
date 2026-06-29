---
target: src/ui/canvas/nested/createCanvasViewportToolbar.ts
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-06-29T20-42-55Z
slug: rc-ui-canvas-nested-createcanvasviewporttoolbar-ts
---
#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Fit/reset report status, but zoom actions do not update interaction text, and menu triggers do not expose open/closed state. |
| 2 | Match System / Real World | 2 | Labels mix "map", "canvas", "view", and "panels"; "map" is especially off-contract for Canaster's workspace/view language. |
| 3 | User Control and Freedom | 3 | Center, reset, and zoom controls are useful recovery tools for a spatial canvas. |
| 4 | Consistency and Standards | 3 | Uses shared `.icon-button` styling, but custom inline SVG paths diverge from the lucide icon vocabulary used elsewhere. |
| 5 | Error Prevention | 2 | Buttons remain active even when `onControl` is absent, and hidden controls remain in focus order via opacity-only visibility. |
| 6 | Recognition Rather Than Recall | 2 | Six icon-only controls rely on labels/title; grouping splits zoom in/out and the Ctrl/Meta recursive behavior is invisible. |
| 7 | Flexibility and Efficiency | 3 | Pointer, keyboard focus, and modifier-key recursive targeting support efficient use. |
| 8 | Aesthetic and Minimalist Design | 3 | Compact, restrained, and canvas-first; no decorative product slop. |
| 9 | Error Recovery | 2 | Reset zoom is strong, but zoom steps lack visible confirmation or current zoom context. |
| 10 | Help and Documentation | 2 | `aria-label` and `title` help, but no toolbar role, popup state, or explanation of scope. |
| **Total** | | **24/40** | **Acceptable: good extraction, but interaction semantics need hardening.** |

#### Anti-Patterns Verdict

**LLM assessment**: This does not read as AI-generated visual slop. It follows Canaster's restrained product chrome: compact icon controls, stable dimensions, tokenized CSS, no gradients, no oversized radii, no decorative card shell. The weakness is product precision, not taste. The toolbar behaves like a power-user viewport widget before it fully explains target scope, menu state, and command grouping.

**Deterministic scan**: `node /Users/artpar/.agents/skills/impeccable/scripts/detect.mjs --json src/ui/canvas/nested/createCanvasViewportToolbar.ts` returned `[]` with exit code `0`. No detector findings and no false positives.

**Visual overlays**: No overlay was applied. The target is a TypeScript DOM factory, not a directly viewable route. The toolbar is mounted indirectly through `createCanvasViewportSlot` and `NativeNestedCanvasController`, with visibility controlled by `data-controls-visible`.

#### Overall Impression

The extraction is structurally sound and visually on-brand, but the component still carries the old toolbar's hidden assumptions. It creates real buttons with labels, which is good; however, it does not model toolbar semantics, popup semantics, disabled state, grouping, or product vocabulary explicitly enough for a bottom-right control surface that non-technical users must trust.

#### What's Working

- The controls are real `<button type="button">` elements with `aria-label` and `title`, so the baseline accessibility is better than canvas-drawn controls.
- The visual styling stays in the existing design system: `.icon-button`, 32px desktop controls, 28px mobile controls, focus outlines, reduced-motion handling, and floating chrome tokens.
- Event stopping is correctly local to toolbar interaction, preventing clicks, double-clicks, context menu, and pointer down from leaking into canvas manipulation.

#### Priority Issues

**[P1] What**: Hidden viewport controls remain keyboard/screen-reader reachable through opacity-only visibility.
**Why it matters**: A keyboard user can tab into controls that were visually absent a moment before. The controller reveals the owner on focus, but the experience is still surprising: focus order teaches hidden structure instead of visible structure.
**Where**: Visibility is CSS-only in `src/ui/styles.css:1872`; focus ownership is handled in `src/ui/canvas/nested/NativeNestedCanvasController.ts:409`.
**Fix**: Add an explicit visibility/accessibility contract. When a toolbar is not visible, set `inert` or disable/tabindex-manage its buttons; when it becomes visible, restore focusability. Keep the focus reveal behavior, but do not make hidden sibling toolbars part of normal traversal.
**Suggested command**: `$impeccable harden src/ui/canvas/nested/createCanvasViewportToolbar.ts`

**[P1] What**: Arrange and theme menu triggers do not expose popup state.
**Why it matters**: These buttons open menu surfaces, but assistive tech cannot know they are menu buttons or whether they are expanded. This is inconsistent with the top toolbar's Add Panel button, which already uses `aria-haspopup` and `aria-expanded`.
**Where**: Buttons are created in `src/ui/canvas/nested/createCanvasViewportToolbar.ts:40`; menus are `role="menu"` surfaces in `src/ui/App.tsx:155` and `src/ui/App.tsx:201`.
**Fix**: Extend `CanvasViewportToolbarOptions` to accept per-control metadata such as `hasPopup`, `expanded`, and optionally `controlsId`. Set `aria-haspopup="menu"` and `aria-expanded` for `arrange` and `theme`.
**Suggested command**: `$impeccable harden src/ui/canvas/nested/createCanvasViewportToolbar.ts`

**[P2] What**: Toolbar grouping splits related actions.
**Why it matters**: The automatic row split puts `zoom-in` on the first row and `zoom-out` on the second. Users must visually search for a pair that should be adjacent, and menu/configuration actions have the same weight as recovery actions.
**Where**: The row split is computed at `src/ui/canvas/nested/createCanvasViewportToolbar.ts:28`; active controls are ordered in `src/ui/canvas/nested/NativeNestedCanvasController.ts:747`.
**Fix**: Replace automatic halving with explicit groups. Example: recovery group (`fit`, `reset-zoom`), zoom group (`zoom-out`, `zoom-in`), configuration group (`arrange`, `theme`). Preserve CSS class hooks so existing placement remains stable.
**Suggested command**: `$impeccable layout src/ui/canvas/nested/createCanvasViewportToolbar.ts`

**[P2] What**: Product language is unstable.
**Why it matters**: Canaster is for non-technical work planning. "Center map" can imply GIS or a separate map mode, while status messages use "view" and component names use "canvas". Mixed terms make users test controls instead of trusting them.
**Where**: Labels live in `src/ui/canvas/nested/createCanvasViewportToolbar.ts:15`; related status text uses "view" in `src/ui/canvas/nested/NativeNestedCanvasController.ts:387`.
**Fix**: Use one vocabulary: "Center view", "Reset view zoom", "Zoom in", "Zoom out", "Arrange panels", "Change view theme" or "Change canvas theme" depending on the intended scope.
**Suggested command**: `$impeccable clarify src/ui/canvas/nested/createCanvasViewportToolbar.ts`

**[P3] What**: Inline SVG icon paths are a local mini icon system.
**Why it matters**: They currently look acceptable, but they create maintenance drift against the lucide-based toolbar vocabulary in React UI.
**Where**: Icon paths live in `src/ui/canvas/nested/createCanvasViewportToolbar.ts:51`; lucide is used by `src/ui/HeaderToolbar.tsx`.
**Fix**: Either document this as the native-DOM icon path boundary, or centralize shared path data for native canvas chrome. Do not force React icons into this DOM factory unless the native controller boundary supports it cleanly.
**Suggested command**: `$impeccable polish src/ui/canvas/nested/createCanvasViewportToolbar.ts`

#### Persona Red Flags

**Alex (Power User)**: Modifier-key recursive targeting is powerful, but invisible. Alex can discover it accidentally and then lack confirmation about whether one view or multiple views changed.

**Sam (Accessibility-Dependent User)**: Icon-only controls have labels, but the group lacks `role="toolbar"`, menu triggers lack popup state, and opacity-only hiding can put hidden controls into keyboard traversal.

**Casey (Distracted Mobile User)**: Touch mode shows controls persistently, which helps access, but nested view controls can add visual noise. The smallest mobile treatment scales the cluster to `0.92`, which weakens touch-target confidence.

#### Minor Observations

- `group.setAttribute('aria-label', 'Canvas controls')` should probably become `role="toolbar"` plus the label.
- `onControl` is optional, but the UI does not express disabled/no-op behavior if no handler is provided.
- Zoom in/out should likely be ordered `zoom-out`, `zoom-in` when placed as a pair; it matches common decrement/increment control grammar.
- The control labels are hard-coded English strings, so future i18n would require revisiting this module.

#### Questions to Consider

- Is the toolbar primarily for view recovery, view manipulation, or canvas configuration? Right now it is all three with equal weight.
- Should `theme` and `arrange` be equally prominent as `center` and `reset`, or should they sit behind a secondary menu?
- Can every label avoid "map" unless the product intentionally adopts a map metaphor?
