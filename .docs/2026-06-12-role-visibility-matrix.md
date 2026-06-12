# Role Visibility Matrix — Admin vs Supervisor

**Date:** 2026-06-12
**Roles:** `Admin`, `Supervisor` (see `lib/auth/capabilities.ts`).
Admin === every capability. Supervisor === the shared base set.

Legend: ✅ visible/allowed · ❌ hidden/denied · 🔒 server-enforced gate.

| Surface | Capability gate | Admin | Supervisor | UI gate | Correct? |
|---|---|---|---|---|---|
| Dashboard (Home) | `dashboard:read` | ✅ all active sites | ✅ own active sites only | `getDashboardData` role branch 🔒 | ✅ |
| Archived Sites (Home) | `site:read_all` (data) | ✅ list + restore + permanent-delete | ❌ empty list → section hidden | `archivedSites` only populated for Admin in service 🔒; `ArchivedSites` self-hides when empty | ✅ |
| Site detail | `site:read` + ownership | ✅ any site | ✅ own sites (`checkOwnership` → 404 otherwise) | server `notFound` 🔒 | ✅ |
| Site → Edit modal | `site:update` | ✅ | ❌ button + modal not rendered | `can(role,'site:update')` client + `supervisors` only fetched for admin; `PATCH /api/sites/[id]` 🔒 | ✅ |
| Site → Archive | `site:delete` | ✅ | ❌ button not rendered | `can(role,'site:delete')` client; `DELETE /api/sites/[id]` 🔒 | ✅ |
| Site → Permanent delete | `site:delete` | ✅ (from Archived list) | ❌ | `DELETE ?permanent=true` 🔒 | ✅ |
| Site → Restore | `site:update` | ✅ | ❌ | `POST /api/sites/[id]/restore` 🔒 | ✅ |
| Create site | `site:create` | ✅ | ✅ (assigned to self) | both roles; supervisor dropdown only for `resource:manage_all` | ✅ |
| Supervisor assignment dropdown | `resource:manage_all` | ✅ | ❌ field hidden | server only fetches supervisors for admin; POST clamps `supervisorId` to self for non-admin 🔒 | ✅ |
| Profile (+ Full name) | `profile:read_self/update_self` | ✅ | ✅ | header avatar → `/app/profile` for all | ✅ |
| Danger Zone (Delete Everything) | `site:delete` | ✅ | ❌ not rendered | `user.role==='Admin'` client; `POST /api/admin/purge` requires `site:delete` + actor-role recheck 🔒 | ✅ |
| Admin subtree `/app/admin/*` | `resource:manage_all` | ✅ | ❌ 404 | `AdminLayout` server `notFound` 🔒 + footer hides link | ✅ |
| Approvals | `*_request:approve`, `transfer:approve` | ✅ | ❌ | under admin subtree 🔒 | ✅ |
| Users management | `user:list/create/manage_roles` | ✅ | ❌ | admin subtree + per-route actor-role recheck 🔒 | ✅ |
| Analytics | `analytics:read` | ✅ | ❌ | admin subtree 🔒 | ✅ |
| Live Feed | `live_feed:read` | ✅ | ❌ | admin subtree 🔒 | ✅ |
| Footer nav | — | Home/Requests/New Log/Transfers/**Admin** | Home/Requests/New Log/Transfers/**Profile** | `AppFooterNav` role branch | ✅ (admins reach Profile via header avatar) |
| Logs / entries (create/edit/delete) | `entry:*` (own-scope) | ✅ all | ✅ own | ownership checks 🔒 | ✅ |
| Catalog read / create | `catalog:read` / `catalog:create` | ✅ | ✅ | both roles | ✅ |
| Category delete (CategoryPicker) | `form_category:delete` | ✅ | ❌ delete button hidden | `role === 'Admin'` client + route 🔒 | ✅ |

## Findings
- No capability/UI mismatches found. Every admin-only control is hidden in the
  UI **and** enforced server-side (defense in depth).
- Archived-sites and Danger-Zone admin tools are data-gated (supervisor receives
  empty/absent data) and route-gated.
- Confirmed admins still reach `/app/profile` (and thus Danger Zone) via the
  header avatar even though the footer swaps Profile→Admin for admins.

## Notes
- Supervisors previously saw a *disabled* archive button on site detail; now they
  see no edit/archive controls at all — cleaner and consistent with the gate.
