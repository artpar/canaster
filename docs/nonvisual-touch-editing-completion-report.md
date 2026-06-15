# Nonvisual Access, Real Touch, And Advanced Editing Completion Report

Date: 2026-06-15

## Executive Verdict

Verdict: **partially fixed**.

Two of the three targeted dents are closed for the current generic canvas foundation:

- the app now exposes a structured, operable node access layer alongside the canvas;
- delete, copy/paste, multi-select, and keyboard resize now have generic model-backed contracts and automated coverage.

The third dent, real-device touch verification, is **blocked in this environment** because no physical iOS Safari or Android Chrome device session was available. Mobile emulation and automated touch probes still pass, but this report does not claim mobile production readiness.

## Nonvisual Access Contract

The app now exposes a generic node access panel labeled `Canvas nodes`.

Implemented behavior:

- every current `CanvasNode` appears in a semantic node list;
- each node exposes label, kind, position, size, detail, and selection state;
- node selection buttons call `CanvasEngine.selectNode`;
- toggle buttons support nonvisual multi-selection;
- edit command buttons call the same engine command path as keyboard/pointer edits;
- the visual canvas remains labeled and keyboard reachable;
- toolbar controls remain before the canvas in tab order;
- status output reports primary selection or multi-selection count.

Automated evidence from `npm run probe:canvas`:

- node access panel label: `Canvas nodes`;
- node access count: `4`;
- exposed sample node labels include `Source Model`;
- edit actions include `Move selection right`, `Resize primary selection wider`, `Copy selection`, `Paste copied nodes`, and `Delete selection`;
- sequential focus order keeps toolbar controls before the canvas, then exposes node access commands.

## Advanced Editing Contract

Implemented engine commands:

- `selectNode(nodeId, source, mode)`;
- `moveSelection(dx, dy, source)`;
- `resizePrimarySelection(dw, dh, source)`;
- `deleteSelection(source)`;
- `copySelection()`;
- `pasteClipboard(source)`.

Selection behavior:

- primary plus multi-selection is represented inside `CanvasEngine`;
- normal pointer click replaces selection;
- Shift/Cmd/Ctrl pointer click toggles selection;
- dragging a selected node moves the selected group;
- keyboard movement applies to all selected nodes;
- resize applies to the primary selected node.

Keyboard behavior:

- Arrow keys move selected nodes by one visible grid step (`32` world units);
- Shift plus Arrow moves selected nodes by four visible grid steps (`128` world units);
- `r` toggles keyboard resize mode for the primary selected node;
- Arrow keys resize width/height in resize mode and snap the edited dimension to the visible grid;
- Escape exits resize mode or clears selection;
- Delete/Backspace delete the selected node or selected group;
- Cmd/Ctrl+C copies the current selection to the internal engine clipboard;
- Cmd/Ctrl+V pastes copied nodes with collision-free ids and grid-snapped positional offset.

Snap-to-grid behavior:

- the visible grid is the editing grid: `32` world units;
- keyboard, nonvisual commands, and paste always snap edited coordinates or dimensions;
- pointer drag and resize snap to the nearest grid coordinate or size;
- holding Alt during pointer drag or resize bypasses snap for precision placement;
- zero-delta pointer drag/resize keeps existing geometry instead of forcing legacy unsnapped nodes onto the grid.

Clipboard contract:

- clipboard is internal to `CanvasEngine`;
- no system clipboard permission or browser clipboard API is claimed;
- paste creates new ids such as `source-copy` and `planner-copy`;
- pasted nodes become the selected group.

Model-change metadata:

- move and resize events include `nodeId`, `nodeIds`, and `source`;
- delete emits `node-delete`;
- paste emits `node-create`;
- sources include `pointer`, `keyboard`, and `nonvisual`.

Automated evidence from `npm run probe:canvas`:

- no-selection delete/copy/paste are no-ops and emit no model changes;
- nonvisual move emits one `node-move` with `source: "nonvisual"` and grid-snaps the final position;
- nonvisual resize emits one `node-resize` and grid-snaps the edited width;
- single delete emits one `node-delete`, removes `source`, and clears selection;
- multi-move emits one `node-move` with two node ids and snaps both selected node positions;
- copy emits no model change;
- multi-paste emits one `node-create`, creates two collision-free ids, snaps pasted positions, and selects the pasted nodes;
- multi-delete emits one `node-delete` with two node ids and clears selection;
- keyboard resize emits `node-resize` with `source: "keyboard"` and snaps the edited dimension;
- pointer snap probe moves a node from `0,0` to `32,32` for a `45,45` raw drag;
- pointer snap probe resizes a `160x96` node to `192x128` for a raw `183x119` resize;
- Alt pointer probe preserves raw `45,45` move and raw `183x119` resize.

## Real-Device Touch Status

Status: **blocked, not verified**.

Reason:

- This environment can run Chrome headless, browser DevTools, and mobile/high-DPR emulation.
- It does not provide physical iOS Safari or Android Chrome device access.
- Therefore real-device touch cannot be honestly marked complete here.

What is still verified:

- automated synthetic pointer/touch probe passes;
- two-finger pan changes viewport only;
- pinch zoom changes viewport only;
- second-touch during drag/resize rolls back model edits;
- gesture cancellation leaves no stuck state;
- mobile/high-DPR emulation remains part of the live browser checklist.

What is not claimed:

- no mobile production readiness claim;
- no iOS Safari claim;
- no Android Chrome real-device claim;
- no real hardware gesture latency claim.

## Real-Device Verification Checklist

Run this when physical devices are available.

Server:

```bash
npm run dev -- --host 0.0.0.0 --port 5179 --strictPort
```

Open `http://<machine-lan-ip>:5179/` from each device.

Required devices:

- iPhone Safari or iPad Safari;
- Android Chrome;
- at least one high-DPR real device.

Record for each device:

- date;
- device model;
- OS version;
- browser and browser version;
- viewport orientation;
- whether remote console showed errors;
- screenshot or screen recording path.

Gestures to verify:

- one-finger node select;
- one-finger node drag;
- one-finger primary-node resize;
- one-finger blank-space pan;
- two-finger pan;
- pinch zoom;
- second touch during drag rolls back model edit and enters gesture behavior;
- second touch during resize rolls back model edit and enters gesture behavior;
- pointer cancellation/interruption where practical;
- orientation or viewport resize where practical.

Expected outcomes:

- node drag emits one `node-move`;
- resize emits one `node-resize`;
- pan/pinch emits no model changes;
- second-touch rollback emits no model changes for the interrupted edit;
- status text distinguishes model edits from viewport gestures;
- no stuck drag, resize, pan, or gesture state after interruption;
- no console/runtime errors.

## Required Gates

```bash
npm run build
```

Passed during implementation.

```bash
npm audit --omit=dev
```

Passed during baseline: `found 0 vulnerabilities`.

```bash
npm run probe:canvas
```

Passed after adding the nonvisual and advanced-editing assertions.

Important final probe evidence:

- canvas `tabIndex: 0`;
- node access panel exposes `4` nodes;
- keyboard movement still emits `node-move` with `source: "keyboard"`;
- keyboard resize emits `node-resize` with `source: "keyboard"`;
- nonvisual move/resize emit `source: "nonvisual"`;
- delete, copy/paste, multi-select, and no-op contracts pass;
- existing pointer cancellation, touch gestures, lifecycle cleanup, future model shape, and 1k/2k performance probes still pass.

## Live Browser Evidence

Live server:

```bash
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Accessibility snapshot:

- root app exposes `Canvas workspace`;
- visual canvas is exposed as `Canvas "Canway canvas"`;
- node access layer is exposed as `complementary "Canvas nodes"`;
- node access layer exposes all sample nodes with labels, kind, position, size, detail, and selection controls;
- edit command buttons are named: Move selection right, Resize primary selection wider, Copy selection, Paste copied nodes, Delete selection;
- status remains an atomic polite live region.

Desktop `1280x900`, DPR `2`:

- canvas bitmap `2560x1800`;
- engine DPR `2`;
- rendered/total `4/4`;
- topbar/statusbar overlap: `false`;
- panel/statusbar overlap: `false`;
- panel/topbar overlap: `false`;
- nonvisual multi-select selected two nodes;
- nonvisual move emitted `node-move planner nonvisual`;
- paste increased node rows from `4` to `6`;
- nonvisual resize emitted `node-resize source-copy nonvisual`;
- nonvisual delete returned node rows to `4` and cleared selection.

Mobile/high-DPR emulation `390x844x3`:

- canvas CSS `390x844`;
- bitmap `780x1688`;
- engine DPR cap `2`;
- rendered/total `4/4`;
- topbar, statusbar, and node panel stayed in viewport;
- topbar/statusbar, panel/statusbar, and panel/topbar overlap were all `false`;
- node panel exposed `4` node rows;
- synthetic pinch changed zoom from `26%` to `40%`;
- status after touch gesture kept `No model changes`.

Screenshots:

- `/tmp/canway-nonvisual-node-access.png`
- `/tmp/canway-mobile-node-access-touch.png`

Console/network:

- console contained only expected Vite debug messages and the React DevTools info message;
- network requests were expected Vite/module requests returning `200` or cache `304`;
- no unexpected failed request was observed.

## Residual Risks

- Real-device touch remains unverified until the checklist above is run.
- The nonvisual layer is generic to `CanvasNode`; it is not a product-domain object model.
- System clipboard integration is intentionally not implemented.
- Multi-selection group resize is intentionally not implemented; resize targets the primary selected node.
- The app still has no backend, persistence, routing, collaboration, export, auth, or product-specific semantics.

## Final Scope Statement

The nonvisual access and advanced editing dents are closed for the current canvas foundation. Real-device touch is converted from an untracked risk into a blocked, repeatable verification checklist. The project remains not product-complete.
