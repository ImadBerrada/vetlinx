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

System roles currently used: `PROFESSIONAL`, `REVIEWER`, `OPERATIONS_ADMIN`, and `PLATFORM_ADMIN`. Organization roles currently used: `OWNER`, `ADMIN`, `RECRUITER`, and `STAFF`.

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
