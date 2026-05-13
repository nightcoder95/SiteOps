# SiteOps Design Spec: Supervisor/Admin Site + Category + Subcategory Creation

Date: 2026-05-10
Status: Draft for user review
Author: Codex

## 1. Objective

Enable both Supervisors and Admins to create and use:
- Work sites
- Global categories
- Global subcategories

Support deterministic duplicate detection (fast path) for category and subcategory creation with soft warning:
- `Use existing`
- `Create anyway`

This must preserve current app-router architecture and forms flow (`site -> category -> subcategory -> new entry`).

## 2. Confirmed Requirements

1. Domain is construction work logging.
2. Both Supervisor and Admin can create sites, categories, and subcategories.
3. Categories and subcategories are global (not site-scoped).
4. Duplicate checks required for both categories and subcategories.
5. Matching must be deterministic and fast (no embeddings/LLM).
6. If likely duplicate is found, show soft warning, never hard block.
7. Before introducing any new API route, verify whether equivalent API already exists and extend it first.

## 3. Current-State Findings (API Inventory)

Existing relevant APIs:
- `GET /api/sites` and `POST /api/sites` exist in `app/api/sites/route.ts`.
- `POST /api/sites` is currently Admin-only.
- `GET /api/forms/categories` exists in `app/api/forms/categories/route.ts`.
- `GET /api/forms/categories/[id]` exists in `app/api/forms/categories/[id]/route.ts`.

Missing relevant APIs:
- Category creation (`POST /api/forms/categories`) is not implemented.
- Subcategory creation endpoint is not implemented.
- Similarity suggestion endpoints for category/subcategory are not implemented.

Design rule for implementation:
- Extend existing routes where possible.
- Add new routes only when no existing route can reasonably own the capability.

## 4. UX and Interaction Design

### 4.1 Forms Flow Enhancements

On `site` step:
- Add `+ Add site` action.
- Opens site creation sheet/modal.
- On successful create, refresh list and auto-select created site.

On `category` step:
- Add `+ Add category` action.
- Modal includes name input and live deterministic suggestions panel.
- If suggestions exceed threshold, show soft warning with `Use existing` / `Create anyway`.

On `subcategory` step:
- Add `+ Add subcategory` action.
- Category context is fixed to selected category.
- Same suggestion + soft warning behavior.

### 4.2 Warning UX

When score >= threshold:
- Inline warning block with candidate list and score labels (`High match`, `Possible match`).
- Primary path: `Use existing` (select candidate and close).
- Secondary path: `Create anyway` (submits create payload with override flag).

### 4.3 Empty-State UX

If no sites/categories/subcategories:
- Show explicit CTA to create first item in-place.
- Do not block user in dead-end empty screen.

## 5. Authorization and Policy

### 5.1 Sites

Update policy in `POST /api/sites`:
- Allow both Supervisor and Admin.
- For Supervisor-created site, enforce `supervisorId = session.user.id` server-side.
- Admin may set any valid supervisor.

### 5.2 Categories/Subcategories

- Both Supervisor/Admin can create global categories/subcategories.
- Track `createdBy` and timestamps.
- Keep read visibility for authenticated site users as today.

## 6. Deterministic Similarity Design

### 6.1 Normalization

For each compared label:
- lowercase
- trim and collapse spaces
- remove punctuation/symbol noise
- normalize common separators (`-`, `_`, `/`) to spaces
- singular/plural light normalization for terminal `s`

### 6.2 Score Model (Deterministic)

Composite score [0..1] using weighted features:
- exact normalized equality: 1.0 shortcut
- token overlap (Jaccard-like)
- normalized edit similarity (Levenshtein ratio)

Proposed thresholds:
- high: >= 0.85 (strong warning)
- medium: >= 0.70 (soft warning)
- below medium: no warning

### 6.3 Scope of Comparison

- Categories: compare against all existing categories.
- Subcategories: compare against subcategories within selected category by default; optionally include global cross-category suggestions tagged as `cross-category`.

## 7. API Design

### 7.1 Extend Existing APIs First

1. `POST /api/sites` (existing route)
- Update auth guard from `requireAdmin` to policy permitting Admin or Supervisor.
- Enforce supervisor assignment rules server-side.

2. `POST /api/forms/categories` (extend existing categories route)
- Add create capability to `app/api/forms/categories/route.ts`.

### 7.2 New APIs (only where missing)

1. `POST /api/forms/subcategories`
- Create global subcategory under category.

2. `POST /api/forms/categories/similar`
- Request: `{ name: string }`
- Response: candidates with score and band.

3. `POST /api/forms/subcategories/similar`
- Request: `{ categoryId: string, name: string }`
- Response: candidates with score and band.

### 7.3 Response Contract

Suggestion response:
- `candidates: [{ id, name, score, band }]`
- `topScore`
- `recommendedAction: 'use_existing' | 'create_new'`

Create request may include:
- `overrideDuplicateWarning: boolean`
- `selectedExistingId?: string`

## 8. Data Model Impact

Preferred minimal change:
- Add normalized name columns:
  - `categories.normalizedName`
  - `subcategories.normalizedName`
- Index normalized columns for exact-fast lookup and candidate prefilter.

Optional future:
- Add audit note field for duplicate override reason.

## 9. Error Handling

- Validation errors: clear field-level messages.
- Duplicate suggestion fetch failure: creation still possible, warning UI degraded with notice.
- Creation race/conflict: return 409 with latest conflicting entity hints.

## 10. Testing Strategy

### 10.1 Unit Tests

- normalization function edge cases
- deterministic score function cases:
  - exact match
  - punctuation variants
  - plural variants
  - near-miss names

### 10.2 API Tests

- supervisor site create success
- category create success with/without warning override
- subcategory create success with/without warning override
- similarity endpoints candidate ordering and threshold bands

### 10.3 UI Tests

- empty state CTA appears when none exist
- soft warning appears at threshold
- `Use existing` selects candidate
- `Create anyway` creates new item and continues flow

## 11. Rollout Plan

1. Backend policy and API extensions
2. Similarity engine + endpoints
3. UI actions/modals in site/category/subcategory steps
4. E2E path: no data -> create site/category/subcategory -> log entry

## 12. Out of Scope

- Embeddings/LLM semantic matching
- Category governance workflow (approval queues)
- Role-based publishing states for taxonomy

## 13. Risks and Mitigations

1. Over-suggesting duplicates (false positives)
- Mitigation: soft warning only, never hard block.

2. Under-suggesting true duplicates (false negatives)
- Mitigation: tune thresholds with production examples and telemetry.

3. Permission regression on site creation
- Mitigation: explicit tests for Admin and Supervisor paths.

## 14. Acceptance Criteria

1. Supervisor can create a site and immediately use it in forms flow.
2. Admin can create a site with explicit supervisor assignment.
3. Category creation presents deterministic duplicate suggestions.
4. Subcategory creation presents deterministic duplicate suggestions.
5. User can always choose `Use existing` or `Create anyway`.
6. Created items become globally available in subsequent selection steps.
7. No dead-end empty states in site/category/subcategory steps.

