---
name: Canaster
description: A calm, powerful nested canvas workspace for practical work planning.
colors:
  canvas-night: "#101217"
  canvas-light: "#f4f6f8"
  panel-iron: "#181d25"
  panel-white: "#ffffff"
  node-charcoal: "#1f2630"
  ink-high-dark: "#eef2f6"
  ink-body-dark: "#c6ced8"
  ink-muted-dark: "#8b96a5"
  ink-high-light: "#18212d"
  ink-body-light: "#3d4652"
  ink-muted-light: "#7a8594"
  grid-dark: "#1b2028"
  grid-major-dark: "#252c36"
  grid-light: "#e0e5eb"
  grid-major-light: "#cbd3dd"
  border-dark: "#303946"
  border-light: "#cfd7e2"
  action-blue: "#5aa7ff"
  action-blue-light: "#2f6fd0"
  work-green: "#42c987"
  work-green-light: "#228a5b"
  system-amber: "#f2a65a"
  system-amber-light: "#bd6c1c"
  resize-gold: "#f2c94c"
  warning-gold: "#e0b75d"
  error-red: "#ff7f7f"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.38
    letterSpacing: "0"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0"
rounded:
  none: "0"
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "18px"
components:
  toolbar-panel:
    backgroundColor: "{colors.panel-iron}"
    textColor: "{colors.ink-high-dark}"
    rounded: "{rounded.lg}"
    padding: "4px"
    height: "40px"
  icon-button:
    backgroundColor: "{colors.panel-iron}"
    textColor: "{colors.ink-body-dark}"
    rounded: "{rounded.md}"
    width: "32px"
    height: "32px"
  field-compact:
    backgroundColor: "{colors.panel-iron}"
    textColor: "{colors.ink-body-dark}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "30px"
  canvas-node:
    backgroundColor: "{colors.node-charcoal}"
    textColor: "{colors.ink-high-dark}"
    rounded: "{rounded.lg}"
    padding: "12px"
---

# Design System: Canaster

## 1. Overview

**Creative North Star: "The Field Desk"**

Canaster should feel like a dependable work surface carried between office, site, and shared screen: compact, readable, sturdy, and ready for interruption. The current visual system is a restrained product interface with a dark canvas-first default, a light operational fallback, floating utility chrome, and precise blue selection feedback.

The system is not decorative. Panels float because they must stay available over the canvas; blur is an overlay legibility tool, not a visual theme. Color is sparse and functional: blue identifies selection and primary action, green marks successful or data-oriented state, amber marks system or pending state, and red is reserved for failure.

It explicitly rejects the anti-references in PRODUCT.md: developer diagramming tools, BI dashboards, generic whiteboards, novelty mind maps, terminal aesthetics, engineering jargon, dense admin-console chrome, overplayful collaboration cues, ornamental gradients, decorative canvas flourishes, and graph/database assumptions.

**Key Characteristics:**
- Canvas-first, chrome-second hierarchy.
- Compact controls with stable dimensions.
- Functional color only; no ornamental accents.
- Clear focus, selection, sync, and disabled states.
- Direct manipulation vocabulary for non-technical professionals.

## 2. Colors

The palette is a restrained dual-theme canvas system: near-black and cool off-white surfaces, neutral panels, and three semantic accents used only when state or object type needs to be unmistakable.

### Primary
- **Working Blue**: Used for active selection, focus rings, selected node borders, active node rows, and the task accent. It is the product's action color and should remain rare.
- **Light Working Blue**: Light-theme equivalent for selected state, active rows, and focus-critical moments.

### Secondary
- **Work Green**: Used for clean sync state, data nodes, active context toggles, and positive confirmation.
- **System Amber**: Used for system nodes and warm operational state.
- **Resize Gold**: Used only for resize handles and manipulation anchors; it should not become a brand accent.

### Tertiary
- **Error Red**: Used only for failed sync or destructive/error confirmation.
- **Warning Gold**: Used for dirty, saving, or loading document state.

### Neutral
- **Canvas Night**: Dark default workspace background.
- **Canvas Light**: Light-theme workspace background.
- **Panel Iron**: Dark floating panel base, usually rendered with alpha over the canvas.
- **Panel White**: Light floating panel base, usually rendered with alpha over the canvas.
- **Node Charcoal**: Dark node body surface.
- **Ink High / Body / Muted**: Three-step text hierarchy for primary labels, readable body text, and status metadata.
- **Grid Lines / Major Grid Lines**: Low-contrast spatial reference lines for pan and zoom orientation.
- **Node Borders**: Structural outline for node edges, panels, and compact controls.

### Named Rules

**The State Owns Color Rule.** Blue, green, amber, gold, and red are state and type colors. Never use them as decoration.

**The Canvas Leads Rule.** The canvas background and grid establish the product atmosphere; panels must support the work surface, not compete with it.

## 3. Typography

**Display Font:** Inter with system UI fallbacks
**Body Font:** Inter with system UI fallbacks
**Label/Mono Font:** Inter with tabular numeric features where status or metrics appear

**Character:** The type system is compact and workmanlike. It uses one sans-serif family across labels, toolbar text, fields, canvas nodes, status readouts, and dialog copy so the interface feels familiar rather than branded for its own sake.

### Hierarchy
- **Display** (700, 17px, 1.2): Dialog titles and rare panel-leading text only. Product UI does not use hero typography.
- **Headline** (700, 14px, 1.2): Brand label and strong panel headers.
- **Title** (600, 15px, 1.2): Canvas node titles and canvas portal labels.
- **Body** (400, 13px, 18px canvas rhythm): Node details, dialog paragraphs, and compact explanatory text.
- **Label** (400, 12px, 1.2): Toolbar readouts, form fields, status metadata, row labels, and action buttons.
- **Micro Label** (400, 11px, 1.2): Secondary row metadata only.

### Named Rules

**The No Hero Type Rule.** Canaster is a working tool, not a landing page. Do not introduce clamp-sized display headings, decorative type, or display fonts in app chrome.

**The Tabular Status Rule.** Counts, coordinates, zoom, and statusbar data should use tabular numeric rendering whenever the value changes in place.

## 4. Elevation

The system uses a hybrid of tonal layering, canvas strokes, and functional overlay shadows. At rest, nodes are defined primarily by fill and border. Floating chrome uses a soft shadow and 16px backdrop blur because it sits above a moving canvas; modal confirmation uses the strongest shadow because it temporarily blocks work.

### Shadow Vocabulary
- **Chrome Float** (`0 10px 30px rgba(0, 0, 0, 0.2)`): Topbar groups, brand block, statusbar, and node access panel in dark theme.
- **Chrome Float Light** (`0 12px 28px rgba(38, 50, 68, 0.14)`): Light-theme floating chrome.
- **Node Rest / Hover** (`0 6px 12px rgba(0, 0, 0, 0.38)`): Canvas node depth in normal quality.
- **Node Selected** (`0 6px 18px rgba(0, 0, 0, 0.38)`): Selected canvas node depth; border width and blue stroke carry most of the state.
- **Portal Overlay** (`inset 0 0 0 1px rgba(90, 167, 255, 0.38), 0 8px 24px rgba(0, 0, 0, 0.22)`): Live nested-canvas preview overlays.
- **Confirmation Modal** (`0 18px 48px rgba(0, 0, 0, 0.34)`): Destructive or blocking confirmation panels only.

### Named Rules

**The Overlay Is Earned Rule.** Backdrop blur and shadows are allowed only for UI that must float above the canvas: toolbars, status, panels, previews, and blocking confirmation.

**The Stroke Beats Glow Rule.** Selection is a blue stroke and focus outline first. Shadows may support state, but must not become the state indicator.

## 5. Components

### Buttons
- **Shape:** Compact rectangular controls with gently curved corners (6px).
- **Primary:** Icon-first in app chrome; 32px square on desktop, 28px square on mobile. Text commands appear only where icons would obscure meaning, such as node action rows.
- **Hover / Focus:** Hover uses a low-alpha blue fill and brighter text. Focus uses a 2px Working Blue outline with 2px offset.
- **Disabled:** Opacity drops to roughly 0.42-0.5 and hover treatment is removed.

### Chips
- **Style:** Canaster does not currently use decorative chips. Type badges inside canvas nodes are compact labels drawn inside the node, not pill tags.
- **State:** If chips are added later, they must follow the node-access row vocabulary: neutral border, 6px radius, selected state via Working Blue border and low-alpha fill.

### Cards / Containers
- **Corner Style:** Floating panels use 8px radius. Canvas node shells use 8px radius. Brand marks use 4px internal geometry.
- **Background:** Dark panels use Panel Iron at high alpha over Canvas Night. Light panels use Panel White at high alpha over Canvas Light.
- **Shadow Strategy:** Floating panels use Chrome Float. Canvas nodes use node shadow only when rendered in normal quality or state needs emphasis.
- **Border:** Panels use a subtle neutral border. Canvas nodes use theme node borders, with Working Blue for selected state.
- **Internal Padding:** Canvas nodes use 12px content padding. Panels use 4px toolbar padding or 8px list/header padding.

### Inputs / Fields
- **Style:** Compact fields are 30px high with a 6px radius, neutral border, 12px type, and low-alpha fill.
- **Focus:** Border changes to Working Blue. Do not add decorative glow.
- **Error / Disabled:** Errors should use Error Red for the message or status readout, not full-field red fills. Disabled states should reduce opacity and remove pointer feedback.

### Navigation
- **Style:** Navigation is spatial: toolbar controls, stack slabs, breadcrumbs, parent-context edges, and node access rows. It should avoid heavy sidebars unless the workflow demands persistent inspection.
- **Default / Hover / Active:** Default states are neutral. Active states use Working Blue stroke/fill. Hover should clarify hit targets without changing layout.
- **Mobile Treatment:** At 640px and below, topbar groups wrap, icon buttons reduce to 28px, document controls wrap onto their own line, and statusbar becomes a two-column grid.

### Canvas Nodes
- **Shell:** 8px radius, theme node fill, subtle node border, and 12px content inset.
- **Selection:** Primary selection uses Working Blue border at up to 3px and a gold resize handle.
- **Text:** Node titles use 15px semibold; details use 13px body text on an 18px line rhythm.
- **Type Accents:** Card accent bars are small 28px by 6px markers. They identify object type; they are not side stripes or decorative banners.

### Floating Panels
- **Shell:** 8px radius, subtle neutral border, high-alpha panel fill, Chrome Float shadow, and 16px backdrop blur.
- **Use:** Topbar groups, statusbar, node access panel, breadcrumbs, and confirmation panels.
- **Rule:** Never nest panels as cards inside other panels. Use sections, dividers, or rows instead.

## 6. Do's and Don'ts

### Do:
- **Do** keep the canvas as the primary surface and let chrome float only where the user needs immediate control.
- **Do** use Working Blue for selection, focus, and active affordances only.
- **Do** preserve the 6px control radius and 8px panel/node radius unless a new component has a strong usability reason.
- **Do** keep toolbar controls stable at 32px desktop and 28px mobile so icons never shift layout.
- **Do** make sync, selection, disabled, loading, and error states visible through text, shape, icon, or stroke, not color alone.
- **Do** use practical labels for non-technical professionals; object names should sound like work items, not graph/database primitives.

### Don't:
- **Don't** make this feel like a developer diagramming tool, a BI dashboard, a generic whiteboard, or a novelty mind-map app.
- **Don't** use terminal aesthetics, engineering jargon, dense admin-console chrome, overplayful collaboration cues, ornamental gradients, decorative canvas flourishes, or graph/database assumptions.
- **Don't** introduce gradient text, decorative bokeh/orbs, diagonal stripe backgrounds, or oversized marketing typography.
- **Don't** use side-stripe borders greater than 1px on cards, nodes, callouts, or alerts. Canvas node accent marks must remain small internal markers.
- **Don't** pair a 1px decorative border with a wide soft shadow on generic cards. Shadows are for floating chrome, nodes, overlays, and blocking panels.
- **Don't** use modal dialogs as the first solution for routine actions. Prefer inline panel states and direct manipulation unless the action blocks or destroys work.
