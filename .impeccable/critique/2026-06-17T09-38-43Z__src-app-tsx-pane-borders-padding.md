---
score: 25
p0: 0
p1: 2
p2: 2
target: src/App.tsx pane borders padding
timestamp: 2026-06-17T09-38-43Z
slug: src-app-tsx-pane-borders-padding
---
## Focused Critique: Pane Borders And Padding

Resolved target: `src/App.tsx` surface, pane chrome implemented by `src/styles.css` and `src/engine/nested/NativeNestedCanvasController.ts`.

Overall score: 25/40. The app direction is strong, but the pane chrome currently reads like layout scaffolding: too many persistent blue borders, no pane gutter, no soft containment, and resize handles competing with content.

### Heuristics

| Heuristic | Score | Notes |
| --- | ---: | --- |
| Visibility of system status | 3 | Context panes are visible, but their equal-weight borders make active vs surrounding context harder to parse. |
| Match to user's world | 3 | Nested workspaces are understandable; the pane chrome feels technical rather than calm field-desk UI. |
| User control and freedom | 3 | Resize handles exist and are keyboard-addressable, but their always-visible chrome feels heavier than their task frequency. |
| Consistency and standards | 2 | Pane clips use square, blue inset lines while nodes and panels use softer rounded containment. |
| Error prevention | 3 | No obvious destructive-risk issue from borders/padding. |
| Recognition rather than recall | 2 | Blue edges repeat across active, parent, and nested preview panes, so users must infer hierarchy. |
| Flexibility and efficiency | 3 | The nested layout is powerful, but crowded pane edges reduce scan speed. |
| Aesthetic and minimalist design | 1 | This is the main failure: zero padding, zero radius, and persistent blue lines make the pane system visually noisy. |
| Help users recover | 3 | Not materially affected in this focused pass. |
| Help and documentation | 2 | The UI hints at a map, but pane hierarchy has no quiet visual explanation. |

### Priority Issues

P1: Pane clips have no gutter or softened frame.
Evidence: `.parent-context-canvas-clip` is `border-radius: 0`, `padding: 0`, `overflow: hidden`, and uses `box-shadow: inset 0 0 0 1px rgba(90, 167, 255, 0.38)` in `src/styles.css`. Browser computed style confirmed `borderRadius: 0px`, `padding: 0px`, and a blue inset border on the first pane.
Impact: Context panes butt directly against the active map and each other, so the layout feels cramped and provisional.

P1: Resizer chrome is too visually dominant for a secondary control.
Evidence: current-view resizers render as visible blue bars and 6px blue corner handles. Browser count showed `88` `.parent-context-resizer` buttons on the default nested sample, with `8` current-view handles and `80` nested-preview handles.
Impact: Resize affordances compete with the cards and make the canvas feel like an editor debug grid instead of a quiet workspace.

P2: The same blue border language is doing too many jobs.
Evidence: selected node border, portal preview frame, parent context pane frame, and resize controls all use bright blue.
Impact: Users get weaker hierarchy cues because active selection, contextual previews, and layout boundaries share similar visual weight.

P2: Overflow clipping is doing layout work without a visual comfort layer.
Evidence: browser detector flagged clipped overflow containers on `.parent-context-canvas-clip`, `.portal-overlay`, and `.parent-context-field`.
Impact: The clipped edges become hard seams. With no padding or radius, the seams look accidental, especially on top and side panes.

### Anti-Patterns

Not generic AI slop. The issue is narrower: a powerful nested-canvas system still has pane-container chrome that looks like implementation scaffolding. The static detector returned `[]`; the browser detector found runtime issues because the visual problem emerges from repeated live pane instances.

### Working

The dark grid, compact toolbar, and selected-node treatment fit the Canway direction. The pane architecture is useful and the work-items copy is clearer after the prior pass. The problem is not the core concept; it is the missing pane design tokens for gutter, containment, and affordance weight.

### Personas

For non-technical office users, the pane seams currently add cognitive load because the interface looks more like a drafting tool than a work map. For field users, the dense blue boundaries make it harder to immediately identify the active workspace and the task cards.

### Minor Observations

The onboarding panel hides some of the pane problem until dismissed; after dismissal the pane seams dominate the viewport. The status bar text also truncates, but that is outside this focused border and padding critique.

### Questions

Questions skipped: findings are straightforward and the next design move is clear. The pane chrome should become quieter and more padded while leaving selected nodes and live resize affordances discoverable.

### Recommended Improvement

Add a small fixed pane gutter, a subtle neutral pane border, a modest radius, and lower the resting visibility of resizer lines. Keep stronger blue only for hover, focus, selected nodes, and active interactions.
