# Frontend experience standard

VetLinX must feel like one coherent, trustworthy product across professional, organization, provider, owner, facility, and trust workspaces. A technically functional but visually inconsistent page is not complete.

## 1. Product character

The interface is calm, clinical, precise, premium, and human. It avoids generic admin-template styling, ornamental dashboards, excessive gradients, novelty motion, and dense enterprise clutter.

Trust is communicated through clear provenance, status, permissions, effective dates, and next actions—not through decorative badges alone.

## 2. Design-system ownership

Shared tokens and components own:

- color and semantic status;
- typography and type scale;
- spacing, radii, borders, elevation, and motion;
- layout containers and responsive breakpoints;
- application shell, sidebar, top bar, breadcrumbs, and workspace switcher;
- buttons, links, fields, selectors, uploads, tables, cards, tabs, dialogs, drawers, toasts, timelines, filters, pagination, and skeletons;
- evidence, verification, provenance, expiry, and permission presentation;
- charts only when a user decision requires visualization.

Page-specific CSS may arrange domain content but must not redefine shared primitives.

## 3. Workspace model

The same account may switch among:

- personal/professional workspace;
- organization/provider/facility workspaces;
- animal-owner workspace;
- trust operations, when authorized.

Workspace switching changes context and navigation while preserving the common shell. The active organization/facility is always visible. A user must never unknowingly mutate the wrong organization.

Licensing curation and review live under `/review/licensing`; they must not appear in the professional or provider workspace merely because the same account holds another persona.

## 4. Standard page patterns

### Hub

Shows readiness, urgent actions, recent activity, and recommendations tied to a decision. It does not show fake KPIs.

### Catalogue/list

Provides search, governed filters, sorting, pagination, result count, saved state where useful, and a meaningful empty state.

### Detail

Shows identity, status, provenance, requirements, relevant history, and one clear primary action.

### Guided workflow

Uses named steps, save/resume, validation near the field, progress based on real completion, review before submission, and a durable completion receipt.

### Management workspace

Uses scoped filters, data table/list alternatives where appropriate, bulk-safe operations, confirmation for consequential actions, and visible audit history.

### Evidence/history

Shows issuer/source, verification level, validity, effective/expiry dates, privacy, decisions, and amendments without allowing silent overwrite.

## 5. Interaction states

Every data-bound surface defines:

- initial loading;
- background refresh;
- empty first-use state;
- empty filtered state;
- partial data;
- field and form validation;
- optimistic/pending mutation where safe;
- successful completion;
- recoverable network failure;
- server failure with correlation/support path;
- unauthenticated;
- unauthorized/forbidden;
- expired session;
- stale or superseded content;
- offline behavior where supported.

Errors preserve user input and provide an actionable recovery path. Success messages state what changed and where to go next.

## 6. Responsive behavior

- Desktop optimizes multi-column comparison and operational work.
- Tablet supports touch and reduced multi-column layouts.
- Mobile prioritizes the current task, sticky safe actions, readable forms, and progressive disclosure.
- Tables define mobile transformations instead of horizontal overflow by accident.
- Dialogs become drawers/full-screen flows when space requires it.
- No principal workflow requires hover.

## 7. Arabic and RTL

- Layout direction mirrors where semantic; identifiers, codes, email, URLs, and numeric sequences retain appropriate direction.
- Icons with directional meaning mirror; universal icons do not.
- Copy expansion and mixed Arabic/English content are tested.
- Dates, times, time zones, numbers, currencies, pluralization, and country names use locale-aware formatting.
- Translation keys do not contain concatenated sentence fragments.

## 8. Accessibility

Target WCAG 2.2 AA. Requirements include:

- keyboard-complete navigation and workflows;
- visible focus and logical focus order;
- semantic landmarks/headings;
- labels, descriptions, error associations, and live regions;
- color-independent status communication;
- minimum contrast and touch targets;
- reduced-motion support;
- accessible charts/tables and text alternatives;
- screen-reader review of authentication, guided forms, evidence, tables, and dialogs.

## 9. Content and terminology

- One controlled term represents one concept across UI, API, documentation, and support.
- Labels use user language; technical state codes are localized.
- Regulatory claims show jurisdiction, source, effective date, and review date.
- Clinical and employment terminology comes from governed taxonomy.
- Destructive/consequential actions state impact and require appropriate confirmation.

## 10. Prohibited release conditions

A route cannot ship with:

- dead buttons or links;
- placeholder sections exposed as working modules;
- invented metrics or chart data;
- inconsistent shell, sidebar, spacing, typography, or controls;
- duplicated components that only differ cosmetically;
- forms that lose input after a recoverable error;
- missing empty/loading/error/permission states;
- desktop-only or English-only behavior;
- client-only authorization;
- demo content presented as real user data.

## 11. Visual quality workflow

1. Approve route purpose and user journey.
2. Define low-fidelity layout and all interaction states.
3. Reuse or extend design-system primitives.
4. Implement against real API contracts.
5. Review desktop/mobile and English/Arabic fixtures.
6. Run accessibility and end-to-end checks.
7. Capture approved reference screenshots.
8. Require product/design review for intentional visual changes.

## 12. Frontend definition of done

- The principal task completes end to end with real backend behavior.
- All relevant interaction states are implemented.
- Authorization and workspace scope are visible and enforced by the API.
- Responsive, RTL, localization, keyboard, and screen-reader requirements pass.
- End-to-end and visual-regression tests pass on supported viewports.
- Copy, taxonomy, privacy, security, analytics instrumentation, and support behavior are reviewed.
- No manual hidden step is required to make the feature appear functional.
