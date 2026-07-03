# Historical Task Briefs

Status: historical task record. This document replaces the removed execution-task archive.

These entries preserve the useful scope of old agent execution prompts without keeping prompt-shaped instructions in the docs tree. They are not current product, architecture, source-path, or verification contracts. Use `../README.md`, `../architecture-software-kt.md`, `../../PRODUCT.md`, `../../DESIGN.md`, and `../canaster-user-journeys.md` for current contracts.

## Canvas Foundation

### Harden Canway Canvas Engine Foundation

Original scope: fix early canvas foundation dents before adding product-specific layers. The task focused on consistent text and geometry scaling, model-change boundaries, pointer interruption handling, culling, high-DPI behavior, and resize handling.

Final evidence:

- `canvas-engine-reliability-audit.md`
- `canvas-engine-technical-dents-report.md`

### Audit Canway Canvas Engine Reliability Issues

Original scope: systematically audit reliability issues such as state divergence, interrupted input bugs, render inconsistencies, lifecycle leaks, and hidden non-happy-path edge cases.

Final evidence:

- `canvas-engine-reliability-audit.md`

### Exhaustively Find Canvas Engine Technical Dents

Original scope: adversarially investigate technical dents and reliability issues in the canvas foundation before more product complexity was built on top.

Final evidence:

- `canvas-engine-technical-dents-report.md`

### Find All Canvas Foundation Technical Dents

Original scope: re-check previous confidence against the live code and runtime, separating proven facts, confirmed issues, suspicions, and untested gaps.

Final evidence:

- `canvas-foundation-dents-investigation-report.md`

### Find Remaining Canvas Foundation Reliability Issues

Original scope: push into unproven areas left by the previous canvas foundation reports, including browser-probe automation, keyboard and nonvisual behavior, multi-touch, fractional DPR, cleanup, memory growth, and future node stress.

Final evidence:

- `canvas-foundation-remaining-reliability-report.md`

### Automate And Close Canvas Foundation Gaps

Original scope: convert remaining vague reliability gaps into fixed issues, explicit product/UX decisions, or documented residual risks with proof.

Final evidence:

- `canvas-foundation-gap-closure-report.md`

### Find All Remaining Canway Technical Dents

Original scope: determine whether the frontend/canvas foundation still had technical dents, missing verification, ownership gaps, or product-foundation risks after prior reports.

Final evidence:

- `canway-technical-dents-audit-report.md`

### Find Product-Complete Remaining Dents

Original scope: find remaining technical dents, reliability issues, missing verification, product-completeness gaps, and misleading assumptions preventing the app from honestly being called complete.

Final evidence:

- `product-complete-remaining-dents-report.md`

### Perfect Canvas Keyboard, Touch, And Performance

Original scope: close keyboard editing semantics, multi-touch gestures, and large visible graph performance dents.

Final evidence:

- `canvas-keyboard-touch-performance-completion-report.md`

### Perfect Nonvisual Access, Real Touch, And Advanced Editing

Original scope: close residual nonvisual access, real-device touch verification, and advanced editing gaps such as delete, copy/paste, multi-select, and keyboard resize.

Final evidence:

- `nonvisual-touch-editing-completion-report.md`

## Nested Canvas

### Finish Recursive Infinite Nested Canvas

Original scope: finish Canaster's recursive nested canvas implementation so canvas nodes can contain live child canvases recursively instead of static previews or placeholders.

Final evidence:

- `nested-canvas-ux-plan.md`
- `../architecture-software-kt.md`

## Daptin Persistence

### Implement Daptin Document Persistence MVP

Original scope: implement signed-in persistence using Daptin's built-in `document` entity without adding a custom Canaster backend service, app-owned workspace table, or normalized persistence model.

Final evidence:

- `../daptin/daptin-canaster-architecture-plan.md`
- `../daptin/daptin-document-persistence-progress.md`
- `../daptin/daptin-backend-groundwork.md`
- `../architecture-software-kt.md`
