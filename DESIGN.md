---
name: Web Analytics
description: A native editorial instrument for clear Vercel traffic insight inside Umbraco.
colors:
  backoffice-ink: "#060606"
  backoffice-ink-muted: "#2e2b29"
  interactive-navy: "#1b264f"
  interactive-indigo: "#3544b1"
  working-surface: "#ffffff"
  quiet-canvas: "#f3f3f5"
  quiet-divider: "#d8d7d9"
  strong-divider: "#a1a1a1"
  verified-green: "#0b8152"
  attention-amber: "#fbd142"
  error-crimson: "#c31d4c"
typography:
  display:
    fontFamily: "Lato, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "60px"
    fontWeight: 300
    lineHeight: "66px"
  headline:
    fontFamily: "Lato, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 300
    lineHeight: "42px"
  title:
    fontFamily: "Lato, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: "21px"
  body:
    fontFamily: "Lato, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "21px"
  label:
    fontFamily: "Lato, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: "21px"
rounded:
  control: "3px"
spacing:
  space-1: "3px"
  space-2: "6px"
  space-3: "9px"
  space-4: "12px"
  space-5: "18px"
  space-6: "24px"
  layout-2: "30px"
  layout-3: "42px"
components:
  button-primary:
    backgroundColor: "{colors.interactive-navy}"
    textColor: "{colors.working-surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 18px"
  button-secondary:
    backgroundColor: "{colors.quiet-canvas}"
    textColor: "{colors.interactive-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 18px"
  text-input:
    backgroundColor: "{colors.working-surface}"
    textColor: "{colors.backoffice-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  surface-card:
    backgroundColor: "{colors.working-surface}"
    textColor: "{colors.backoffice-ink}"
    rounded: "{rounded.control}"
    padding: "18px"
  filter-chip:
    backgroundColor: "{colors.working-surface}"
    textColor: "{colors.interactive-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 9px"
---

# Design System: Web Analytics

## Overview

**Creative North Star: "The Editorial Instrument"**

Web Analytics is a precise but approachable instrument inside the editorial workspace. It should reveal the traffic signal an editor needs, then get out of the way. The visual language is friendly and conversational, but its structure is disciplined: familiar Umbraco controls, clear hierarchy, compact reporting, and feedback close to the action that caused it.

The extension belongs to the backoffice rather than merely living inside it. It inherits Umbraco UI Library semantics, Lato typography, spacing, focus treatment, and surface hierarchy. Custom analytics patterns may borrow the clarity of Vercel Analytics, but they must be translated into Umbraco's interaction language.

The system explicitly rejects the density, configuration burden, and specialist terminology of an overly dense enterprise analytics platform. It is not Google Analytics, and it must never feel like a separate third-party dashboard embedded in Umbraco.

**Key Characteristics:**

- Native to Umbraco and visually continuous with the backoffice.
- Compact, calm, and focused on decisions rather than exhaustive data.
- Friendly in its language and precise in its numbers.
- Progressive: common answers first, depth only on request.
- Accessible through Umbraco conventions for keyboard, focus, contrast, and reduced motion.

## Colors

The palette is Umbraco's own: quiet neutral surfaces, near-black text, and a restrained indigo interaction color. Always consume the corresponding `--uui-color-*` custom property in implementation so host theming remains authoritative.

### Primary

- **Interactive Indigo:** Selected tabs, visible focus, filters, and the clearest interactive state. Its rarity preserves hierarchy.
- **Interactive Navy:** Primary actions and strong interactive text. It anchors controls without introducing a separate product brand.

### Secondary

- **Verified Green:** Successful connection tests and valid configuration only. Never use it as decoration.
- **Attention Amber:** Warnings, incomplete configuration, or plan limitations that need attention without implying failure.
- **Error Crimson:** Invalid fields, failed requests, and destructive actions. Pair it with explicit text rather than relying on color alone.

### Neutral

- **Backoffice Ink:** Primary text and high-confidence numeric values.
- **Backoffice Ink Muted:** Supporting copy and lower-emphasis labels while maintaining readable contrast.
- **Working Surface:** Cards, dialogs, inputs, and other active work areas.
- **Quiet Canvas:** The backoffice page background and restrained secondary control surfaces.
- **Quiet Divider:** One-pixel borders and separators between related regions.
- **Strong Divider:** Emphasized boundaries only when a standard divider is insufficient.

**The Host Owns the Palette Rule.** Use semantic Umbraco UI variables in production components. Never hard-code a competing brand palette into the extension.

**The Rare Accent Rule.** Interactive Indigo identifies selection, focus, or a meaningful action. It must not become a decorative stripe or large background field.

## Typography

**Display Font:** Lato with Helvetica Neue, Helvetica, Arial, and sans-serif fallbacks  
**Body Font:** Lato with Helvetica Neue, Helvetica, Arial, and sans-serif fallbacks  
**Label Font:** Lato with the same backoffice fallback stack

**Character:** Lato keeps the interface familiar, open, and easy to scan. Weight, spacing, and tabular numerals provide hierarchy; novelty does not come from introducing another typeface.

### Hierarchy

- **Display** (300, 60px, 66px): Rare top-level backoffice titles. Do not use it inside cards or dialogs.
- **Headline** (300, 30px, 42px): Major view titles and exceptional empty states.
- **Title** (400, 21px, 21px): Card groups, dialog titles, and settings sections.
- **Body** (400, 14px, 21px): Descriptions, field guidance, report labels, and conversational status text. Keep explanatory lines comfortably below 75 characters where layout permits.
- **Label** (700, 14px, 21px): Field labels, table headings, selected tabs, and compact actions.
- **Metric values:** Use responsive sizes within their component and `font-variant-numeric: tabular-nums` so changing values remain aligned.

**The Backoffice Voice Rule.** Use sentence case, plain language, and concise labels. Never import marketing-display typography or analytics jargon to create hierarchy.

**The Numbers Stay Still Rule.** Counts, percentages, and chart axes use tabular numerals and must not shift horizontally while data updates.

## Elevation

The system is layered, not lifted. Borders, tonal surfaces, spacing, and grouping establish ordinary hierarchy. Shadows are structural and reserved for content that physically overlays the current task: menus, date pickers, dialogs, and tooltips.

### Shadow Vocabulary

- **Resting surface:** No custom shadow beyond the host `uui-box` treatment. Use a one-pixel Quiet Divider when separation is needed.
- **Low overlay:** `0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)` for compact floating controls.
- **Dialog overlay:** `0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)` for modal surfaces that must separate clearly from the obscured workspace.

**The Flat-at-Rest Rule.** Dashboard cards and settings sections remain flat at rest. If every box casts a shadow, the hierarchy has failed.

## Components

Components are familiar, compact, and task-first. Prefer Umbraco UI Library elements directly; custom Lit components should compose those primitives and preserve their accessible behavior.

### Buttons

- **Shape:** Gently squared Umbraco controls with a small radius (3px).
- **Primary:** Interactive Navy surface, white label, and compact 9px by 18px padding. Reserve it for the single clearest action in a local region.
- **Secondary:** Quiet Canvas or transparent surface with Interactive Navy text. Use for View all, Close, Retry, and non-destructive supporting actions.
- **Hover / Focus:** Hover must remain distinct from the surrounding canvas. Focus uses a visible two-pixel Interactive Indigo outline and cannot rely on color alone.
- **Behavior:** Actions report progress and results where the action occurred. Avoid duplicate Save actions or labels that conceal multiple operations.

### Inputs and Selectors

- **Shape:** Working Surface with a one-pixel Quiet Divider and 3px radius.
- **Spacing:** Labels sit close to their control; related fields use the 18px or 24px spacing steps, not arbitrary gaps.
- **Validation:** Show field-specific guidance directly below the affected control. Mutually exclusive fields must be represented by a choice before revealing the relevant input.
- **Progressive disclosure:** Keep advanced identifiers, mapping fallbacks, and uncommon configuration collapsed until requested.

### Tags and Filter Chips

- **Style:** Compact Working Surface or semantic status surface, 3px radius, clear icon or text, and a visible remove action when removable.
- **State:** Active filters appear as one coherent group between header controls and results. Show the value as the primary label; keep the dimension available to assistive technology or a tooltip.
- **Status:** Positive, warning, and danger tags always include descriptive words, never color alone.

### Cards and Containers

- **Corner style:** Match the host's small 3px radius.
- **Background:** Working Surface against Quiet Canvas.
- **Border:** One-pixel Quiet Divider. Avoid decorative colored side borders.
- **Internal padding:** Use 18px for standard content and 24px for spacious settings groups. Tables and metric tabs may extend to card edges when the boundary is meaningful.
- **Footer:** Pin repeated actions such as View all to a restrained tonal footer so cards in the same grid align.

### Metric Tabs and Charts

- **Metric tabs:** Visitors and Page views are the chart header. They carry the total and comparison, meet the card edges, and use a three-pixel selected underline.
- **Hover:** Use a subtle indigo-tinted surface rather than the same gray as the page background.
- **Chart:** Use a calm blue area, horizontal grid lines only, and a dashed final segment for an in-progress period. Hover anywhere along the plot to reveal the nearest period with a vertical guide.
- **Motion:** Update state without chart entrance animation. Respect `prefers-reduced-motion` for every transition.

### Breakdown Tables

- **Rows:** Use semantic tables, tabular numbers, 12px horizontal content inset, and a proportional tonal bar behind the full row.
- **Bars:** Scale relative to the largest visible contributor and preserve a minimum visible width of 4px for non-zero values.
- **Values:** Right-align metric headers and values. Percentage values expose the exact total through an uncropped tooltip.
- **Actions:** Filtering appears on hover and keyboard focus, while page paths remain dark links with an underline on hover.
- **Depth:** Show the top ten in the card and move complete, searchable results into a focused dialog.

### Settings Groups

- **Summary first:** Each connection begins with its name, health, mapping summary, and the next relevant action.
- **Disclosure:** Expand identity, credentials, routing, and document-type configuration as separate task groups rather than one long form.
- **Feedback:** Save, test, validation, and secret-state feedback remain inside the connection being edited.
- **Security:** Explain server-side secret keys clearly without displaying, returning, or implying storage of access tokens in the browser.

## Do's and Don'ts

### Do:

- **Do** compose native `uui-*` elements and semantic `--uui-color-*`, `--uui-size-*`, and `--uui-type-*` variables.
- **Do** lead with the traffic answer most relevant to the editor's current page or site.
- **Do** keep default views compact and progressively reveal uncommon settings or reporting depth.
- **Do** use friendly, conversational guidance close to the control or report it explains.
- **Do** preserve visible focus, keyboard operation, screen-reader semantics, sufficient contrast, and reduced-motion behavior consistent with Umbraco.
- **Do** reserve shadows for menus, dialogs, date pickers, and tooltips that overlay the current workspace.

### Don't:

- **Don't** reproduce the density, configuration burden, or specialist terminology of enterprise analytics platforms such as Google Analytics.
- **Don't** imply that every available dimension or control must be visible at once.
- **Don't** make the extension feel like a separate application or a third-party widget embedded inside Umbraco.
- **Don't** invent a separate brand palette, typography system, or decorative gradient that competes with the backoffice.
- **Don't** scatter save feedback, filters, or validation away from the component that owns them.
- **Don't** use color alone for success, warning, failure, selection, or filtering state.
- **Don't** animate charts on load or allow skeletons to change the final component height.
