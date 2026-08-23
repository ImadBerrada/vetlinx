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
