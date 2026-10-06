# MVP RBAC matrix

Authorization is enforced in the API. Frontend visibility is convenience only and never the security boundary.

| Capability | Professional | Organization owner/admin | Recruiter | Reviewer/operations | Platform admin |
|---|---:|---:|---:|---:|---:|
| Manage own profile/privacy | Yes | Yes | Yes | Yes | Yes |
| Manage own credentials/evidence | Yes | Yes | Yes | Yes | Yes |
| Read private credential evidence | Owner only | Owner only | Owner only | Assigned reviewer | Yes |
| Review credential requests | No | No | No | Yes | Yes |
| Create organization | Yes | Yes | Yes | Yes | Yes |
| Manage organization | No | Own membership | Own membership | Review only | Yes |
| Review organization evidence | No | No | No | Yes | Yes |
| Create/publish jobs | No | Own organization | Own organization | No | Yes |
| Discover verified candidates | No | Own organization | Own organization | No | Yes |
| Apply/respond to offers | Own record | Own record | Own record | Own record | Own record |
| Schedule interview/send offer | No | Own organization | Own organization | No | Yes |
| Confirm/activate/end employment | No | Own organization | Own organization | No | Yes |
| Read audit trail | No | Scoped business history | Scoped business history | Scoped review history | Yes |
| Grant system roles | No | No | No | No | Operational script only |

Organization permissions are also constrained by active membership and organization ID. A valid system role does not bypass ownership checks unless an endpoint explicitly supports platform administration.

Credential validity uses a separate permission boundary: the assigned reviewer of an approved request may revoke its credential; operations/platform administrators may perform governed revocation across records. Every actor is prohibited from self-revocation. Private reasons/history are visible only through authorized wallet/review surfaces. The original verification decision is preserved.

Delivery status and retry require an operations/platform administrator. Notification preferences and MFA setup/recovery controls are restricted to the current account. In production, system-role-protected routes require enrolled MFA and a server-recorded proof within the previous 15 minutes; this does not replace role/ownership checks.

System roles currently used: `PROFESSIONAL`, `REVIEWER`, `OPERATIONS_ADMIN`, and `PLATFORM_ADMIN`. Organization roles currently used: `OWNER`, `ADMIN`, `RECRUITER`, and `STAFF`.

## B2C authorization

The implemented B2C foundation adds owner-scoped profiles and pet management. An owner can request/cancel only their own appointments, answer clinic time proposals, and request/withdraw a change to their future confirmed visit before arrival. Verified clinic/hospital owners/admins/staff can manage organization-scoped requests, answer owner time changes, record check-in and mark elapsed unarrived visits no-show; recruiters cannot. Mutations hold the organization/member permission through commit. Only clinic owners/admins can enable public appointment intake. See [B2C foundation](b2c-foundation.md).

Clinic service, slot, capacity, publication and scheduling-mode changes require active owner/admin membership in a verified clinic/hospital, held stable through commit. Staff can read the schedule; recruiters and unrelated accounts cannot. Public availability exposes published catalogue/times and aggregate remaining capacity only. Holds are authenticated and scoped to the current owner's active pet; consumption also rechecks pet ownership/status and clinic intake inside the appointment transaction. Private alternatives require the appointment owner or authorized clinic staff. Existing owners can obtain alternatives after intake closes, while the clinic must remain verified.

Clinic resource creation, retirement/reactivation, slot assignment and reservation release use the same verified clinic/hospital owner/admin policy as catalogue management. Staff can read resource labels and assignments; recruiters, owners outside the organization and public users cannot. Retired resources remain in private history and cannot be assigned or reacquired. Public availability and owner-facing alternatives omit resource labels and identifiers. Resource grants and organization verification remain stable through transaction commit.

## Phase 2 authorization extension

Phase 2 adds capability assignments scoped to a verified organization. Provider and instructor access are not global login personas.

| Capability | Professional | Provider manager | Instructor | Licensing curator | Licensing reviewer | Platform admin |
|---|---:|---:|---:|---:|---:|---:|
| Manage own pathway enrollment/evidence links | Yes | Own record | Own record | Own record | Own record | Support only |
| Draft pathway versions | No | No | No | Yes | Yes | Yes |
| Publish/supersede pathway versions | No | No | No | No | Yes | Yes |
| Manage provider catalogue | No | Scoped organization | Assigned content only | No | No | Yes |
| Publish learning products | No | Submit for review | No | No | No | Approved reviewer/admin |
| Manage sessions/attendance | Own learning only | Scoped organization | Assigned sessions | No | No | Yes |
| Grade assessments | Own attempt only | Scoped organization | Assigned assessments | No | No | Yes |
| Issue/revoke certificates | No | Rule-driven/scoped | No direct issue | No | No | Governed support |
| Manage own CPD | Yes | Own record | Own record | Own record | Own record | Support only |

Capability assignments must include organization, permission, optional content/session scope, grantor, effective time, and revocation time. Frontend navigation never substitutes for API authorization.
