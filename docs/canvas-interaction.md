Interaction Model

Embedded canvases should stop being “preview with activation overlay.” They become normal interactive canvas engines.

Rules:

- Single click, drag, wheel, pinch: handled by the embedded CanvasEngine.
- Pan/zoom/select/edit inside that embedded canvas works like the active canvas.
- Double click on an embedded canvas: enter that canvas, making it the active plane.
- This applies to:
    - live child canvases inside portal nodes
    - parent-context border panes
    - nested canvases rendered inside those panes, recursively

- Keyboard focus stays conservative: click can focus an embedded engine, but global toolbar commands still target the active plane unless we explicitly promote focus later.

Implementation Plan

1. Add a new engine interaction mode, likely embedded-live.
    - It attaches pointer, wheel, touch, focus listeners like active.
    - It does not make toolbar commands target it.
    - It accepts onModelChange, onStatus, onPortalLayout, and camera persistence callbacks.
    - It overrides double-click behavior so embedded double-click calls onEnterCanvas(canvasId) instead of zooming.

2. Refactor CanvasEngine double-click handling.
    - Current active double-click zooms.
    - Add onCanvasDoubleClick?: (canvasId, event) => boolean.
    - If callback returns true, skip zoom.
    - Active root can keep zoom behavior.
    - Embedded portal/border engines use callback to enter.

3. Remove pointer-blocking overlay behavior.
    - Portal preview overlay button currently catches click/double-click.
    - Border pane SVG hit rect currently catches click.
    - Change both so canvases receive normal pointer/wheel events.
    - Keep SVG/accessibility hit targets only for keyboard/non-pointer fallback, not as the pointer surface.

4. Persist embedded canvas state.
    - For portal child canvases and border panes backed by real child documents:
        - onModelChange writes to that document via updateCanvasModel.
        - camera changes write to collection.view.cameras[canvasId].
        - selection changes write to collection.view.selections[canvasId].

    - This makes pan/zoom/edit from parent visible when entering later.

5. Make recursive portal previews work inside embedded engines.
    - Any embedded-live engine emits onPortalLayout, same as active.
    - Workspace must track portal layouts per owner engine, not one global portalLayouts.
    - Each embedded engine’s visible child portal gets its own embedded child canvas overlay clipped inside that engine’s DOM rect.
    - Recursion depth is capped by engine budget, not by special-case logic.

6. Replace current flat overlay arrays with engine slots.
    - Key slots by ownerCanvasId + portalNodeId + childCanvasId + mode.
    - Slot types:
        - active plane
        - stack/context plane
        - portal embedded child
        - border pane embedded neighbor

    - Each slot owns:
        - canvas id
        - model source
        - camera source
        - selection source
        - parent DOM rect
        - enter target
        - engine mode

7. Border panes:
    - If pane points to a portal node with childCanvasId, render that child document as embedded-live.
    - Double-click enters that child canvas.
    - If pane points to non-canvas snippet, keep it read-only or selection-only until we model it as a real document. Do not persist edits into a fake one-node snippet model.
    - Pointer pan/zoom can still work visually on snippets, but node edits should be blocked unless the pane maps to a real document.

8. Portal nodes in active/embedded canvases:
    - Their child canvas overlay becomes interactive.
    - Single click inside child overlay interacts with child canvas.
    - Double click inside child overlay enters child canvas.
    - Clicking the portal frame outside the aperture still selects/moves the portal node in the parent.

9. Probe coverage:
    - Portal preview: wheel changes child camera while parent camera stays unchanged.
    - Portal preview: dragging a child node mutates child document, not parent portal geometry.
    - Portal preview: double-click enters child canvas.
    - Border pane: wheel/pan changes pane canvas camera.
    - Border pane: double-click enters pane canvas.
    - Recursive case: child portal inside a border pane mounts another embedded canvas and responds to pan/zoom.
    - Ensure no pointer-blocking .portal-activation / .parent-context-hit-rect intercepts normal pointer interaction.

This is a real interaction architecture change, not just event tweaks. The core shift is: previews become embedded live engines, and “enter” becomes double-click navigation instead of the
only way to interact.
