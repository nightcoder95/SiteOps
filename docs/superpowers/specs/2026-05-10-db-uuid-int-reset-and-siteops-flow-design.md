# SiteOps Design Spec: Integer PK + UUID Business Keys, Structured Resource Flows, and Transfer Approval

Date: 2026-05-10
Status: Draft approved in conversation sections 1-5

## 1. Scope and Decisions

This design covers a **reset migration** for all **non-auth** tables. Existing data does not need preservation.

Confirmed decisions:
- Better Auth tables remain unchanged (`users`, `sessions`, `accounts`, `verifications`).
- All other tables move to:
  - internal PK: `id` integer auto-increment
  - business key: `<entity>_id` UUID unique not null default random
- All non-auth relationships use UUID business keys as FKs.
- `sites.status` remains required with default `"In Progress"`.
- Site actor tracking should store UUID of the user making changes.
- Labour/material/machinery types: fixed defaults + user-extensible custom tables.
- Materials units: global Indian-standard master list + optional custom units.
- Add transfer workflow: supervisor creates pending transfer, admin approves/declines.
- Retain and extend semantic/fuzzy duplicate prevention across extensible entities.

## 2. Architecture Overview

### 2.1 Keying Strategy

For each non-auth table:
- `id serial primary key`
- `<table>_id uuid not null unique default gen_random_uuid()`

All FK columns reference UUID business keys, e.g.:
- `labour_entries.site_id` -> `sites.site_id`
- `material_entries.created_by_user_id` -> `users.id` (auth UUID)

### 2.2 Audit Fields

All mutable domain tables include:
- `created_at`, `updated_at`
- `created_by_user_id` and `updated_by_user_id` where applicable

## 3. Domain Model Changes

### 3.1 Sites

`sites` updates:
- required: `name`, `location`, actor UUID context (`created_by_user_id`, `updated_by_user_id`)
- `status` required default `In Progress`
- all other existing site attributes nullable (budget, progress, phase, archivedAt remains nullable)

### 3.2 Labour

`labour_entries`:
- `id` int PK
- `labour_entry_id` UUID business key
- `site_id` UUID FK
- `work_type_mode` enum: `default_enum | custom`
- `work_type_enum` enum nullable (default set)
- `work_type_custom_id` UUID nullable FK -> `custom_labour_types.labour_type_id`
- `people_count` required int
- `remarks` optional text

Default labour enum values:
- Steel work
- Shuttering
- Brick work
- Concrete work
- Plastering
- Electric work
- Plumbing
- Tile work
- Wood work
- Paint work

`custom_labour_types`:
- int PK + UUID business key
- `name`, `is_active`, `created_by_user_id`, timestamps
- duplicate prevention on create

### 3.3 Materials

`material_entries`:
- int PK + UUID business key
- `site_id` UUID FK
- `material_type_mode` enum: `default_enum | custom`
- `material_type_enum` nullable enum
- `material_type_custom_id` nullable UUID FK -> `custom_material_types.material_type_id`
- `quantity` numeric required
- `unit_mode` enum: `master | custom`
- `unit_master_id` nullable UUID FK -> `unit_master.unit_id`
- `unit_custom_id` nullable UUID FK -> `custom_units.unit_id`
- `remarks` optional text

Default material enum values:
- Cement
- M sand
- P sand
- Metal

`custom_material_types`:
- int PK + UUID business key
- `name`, `is_active`, actor UUID, timestamps
- duplicate prevention on create

### 3.4 Machinery

`machinery_entries`:
- int PK + UUID business key
- `site_id` UUID FK
- `equipment_type_mode` enum: `default_enum | custom`
- `equipment_type_enum` nullable enum
- `equipment_type_custom_id` nullable UUID FK -> `custom_machinery_types.equipment_type_id`
- `count` required int
- `hours_active` nullable numeric
- `remarks` optional text

`custom_machinery_types`:
- int PK + UUID business key
- `name`, `is_active`, actor UUID, timestamps
- duplicate prevention on create

### 3.5 Units

`unit_master` (global):
- int PK + UUID unit key
- `code`, `label`, `category`, `is_active`, timestamps
- seeded with Indian construction-relevant units

Initial master unit set (minimum):
- count units: Nos, Pair, Set
- bag/package units: Bag (50 kg), Packet
- weight: kg, tonne
- volume: litre, kilolitre, cubic meter
- area/length: sq ft, sq m, running ft, meter
- transport/load: trip
- time: hour, day

`custom_units`:
- int PK + UUID unit key
- optional `site_id` UUID nullable (global custom if null; site-scoped if present)
- `name`, `symbol`, actor UUID, timestamps
- duplicate prevention on create

## 4. Transfer Workflow

Create `resource_transfers`:
- int PK + UUID business key `transfer_id`
- `from_site_id` UUID FK
- `to_site_id` UUID FK
- `requested_by_user_id` UUID (supervisor)
- `approved_by_user_id` UUID nullable (admin)
- `resource_type` enum: `Labour | Materials`
- subtype resolution fields mirroring entry model:
  - labour enum/custom fields OR material enum/custom fields
  - material unit fields for material transfers
- `quantity` numeric required
- `remarks` optional
- `status` enum: `Pending | Approved | Declined` default Pending
- `requested_at`, `reviewed_at`, `created_at`, `updated_at`

Rules:
- supervisor can create transfer only for authorized site access
- all new transfers are Pending
- admin approves/declines
- only Approved transfers affect reporting totals

## 5. API Contract Changes

### 5.1 Identifier Model
- Domain endpoints use UUID business IDs for path/query/body identifiers.
- Internal int IDs are never exposed externally.

### 5.2 Updated Entry Payload Patterns

Labour entry payload (conceptual):
- `siteId`, `date`
- `workTypeMode`
- either `workTypeEnum` or `workTypeCustomId`
- `peopleCount`, `remarks?`

Material entry payload:
- `siteId`, `date`
- material type mode + enum/custom selector
- `quantity`
- unit mode + master/custom selector
- `remarks?`

Machinery entry payload:
- `siteId`, `date`
- equipment mode + enum/custom selector
- `count`, `hoursActive?`, `remarks?`

### 5.3 New Endpoints

Add endpoints for:
- custom labour type create/list
- custom material type create/list
- custom machinery type create/list
- unit master list
- custom unit create/list
- transfer create/list
- transfer admin review (approve/decline)

### 5.4 Existing Duplicate-Check Endpoints

Retain category/subcategory duplicate prevention and extend equivalent behavior to custom types/units.

## 6. UX Flow Alignment

Target flow:
1. Login
2. Site selection list (Site A/B/C...) + create new site
3. Enter selected site
4. Category list (Labour, Materials, Machinery/Equipment, Expenses, etc.) + add category
5. Category detail/subtype selection + add subtype
6. Entry capture for quantity/people/hours + remarks
7. Save and allow additional entries
8. Labour/Material transfer action with Pending state
9. Admin approval center approves/declines transfer

Notes:
- Existing dynamic category/subcategory system remains; structured labour/material/machinery paths become first-class for speed and consistency.

## 7. Duplicate Prevention Strategy

Apply to category, subcategory, custom types, and custom units:
1. Normalize input (trim, lower/case-fold, collapse spaces, punctuation normalization).
2. Reject exact duplicate after normalization.
3. Run fuzzy similarity; if threshold exceeded, return likely duplicates and block create.
4. Optional override path can be added later (if needed, admin-only).

## 8. Error Handling and Validation

- Strong Zod validation for mode/value consistency:
  - if mode=`default_enum`, enum must be provided and custom ID absent
  - if mode=`custom`, custom ID must be provided and enum absent
- Unit/material coupling checks for material entries/transfers
- Role checks:
  - supervisor create transfers
  - admin review transfers
- Authorization checks on site-scoped actions

## 9. Testing Strategy

- Schema + migration smoke tests
- Zod validator unit tests for all mode combinations
- API tests:
  - create/list custom types and units
  - entry creation with enum/custom branches
  - transfer creation pending state
  - admin approve/decline behavior
  - reporting excludes pending/declined transfers
- Duplicate-prevention tests for normalization + fuzzy collisions

## 10. Implementation Constraints and Order

Recommended order for single-pass reset (Approach 1):
1. Create reset migration for non-auth tables and enums
2. Update Drizzle schema and relations
3. Update validation schemas
4. Update query/service layer
5. Update API routes
6. Update UI flows/forms
7. Update tests and run verification

## 11. Out of Scope

- Data-preserving migration/backfill logic (explicitly unnecessary now)
- Better Auth table redesign
- Multi-step inventory accounting engine beyond approved transfer effects

