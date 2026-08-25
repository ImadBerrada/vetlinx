# Phase 2 specification — Licensing, learning, and CPD

## 1. Objective

Extend trusted professional identity into licence readiness and verifiable learning while avoiding clinical-record and payment complexity.

## 2. In scope

- Jurisdictions, licensing authorities, licence types, and versioned pathways.
- Sourced requirements, eligibility rules, readiness, evidence reuse, external application tracking, issued licences, expiry, and renewal.
- Verified education providers, free/institution-sponsored courses and webinars, sessions, enrollment, progress, attendance, assessments, certificates, and CPD.
- Professional library and events pilot under content governance.
- Portfolio, notification, audit, outbox, taxonomy, search, English/Arabic, RTL, responsive, accessibility, and operations requirements.

## 3. Out of scope

- Government submission without an official integration.
- Legal advice or guaranteed licensing outcomes.
- Paid checkout, refunds, instructor payouts, tax calculation, or marketplace settlement.
- Full LMS authoring, video hosting, or examination proctoring when a partner is more appropriate.
- Owner, animal, appointment, facility PMS, clinical-record, prescribing, inventory, or clinical AI workflows.

## 4. Personas and permissions

| Persona | Primary permissions |
|---|---|
| Professional | Manage own pathway enrollments, link own evidence, enroll in learning, complete assessments, view own certificates/CPD. |
| Provider manager | Manage provider catalogue and learners within an authorized organization. |
| Instructor | Manage assigned sessions, attendance, and grading within explicit scope. |
| Licensing curator | Draft jurisdictions, authorities, pathway versions, sources, and requirements. |
| Licensing reviewer | Approve, publish, supersede, or withdraw pathway versions. |
| Learning reviewer | Approve, reject, unpublish, or request changes to learning products. |
| Platform administrator | Controlled support and governance; no silent mutation of professional evidence. |

Provider permissions require both an active organization membership and an education capability assignment. A global system role alone does not grant provider access.

## 5. Licensing domain

### 5.1 Entities

- `LicensingJurisdiction`: country/subnational scope, code, localized name, active status.
- `LicensingAuthority`: verified organization/authority reference, jurisdiction, source URL, review date.
- `LicenceType`: stable code, title, professional scope, jurisdiction.
- `LicencePathway`: stable identity across versions.
- `LicencePathwayVersion`: status, version, effective dates, source provenance, review owner.
- `PathwayRequirement`: category, rule, label, description, order, mandatory flag, evidence types.
- `PathwayEnrollment`: professional, pathway version, status, timestamps.
- `RequirementProgress`: state, explanation, linked credential/evidence, professional note, reviewer note.
- `ExternalApplication`: authority reference, submission date, status, last checked, user note.
- `ProfessionalLicence`: issued identifier, authority, dates, status, credential relationship.

### 5.2 Pathway rules

- Published versions are immutable except for administrative metadata.
- Corrections create a new version and preserve historical enrollments.
- Every requirement shows why it applies and which evidence can satisfy it.
- Automated evaluation may suggest satisfaction; only governed verification may establish trusted satisfaction.
- Evidence links preserve original ownership, visibility, verification, expiry, and revocation.
- A revoked or expired source credential re-evaluates affected requirement progress.
- External application status is user-reported unless an authority integration confirms it.

### 5.3 Professional acceptance criteria

- A professional can compare available licence pathways by jurisdiction and licence type.
- Eligibility results explain satisfied, missing, conditional, and manually reviewed requirements.
- Starting a pathway pins a specific published version.
- Existing verified evidence can be linked without another upload.
- Missing requirements have clear actions and source references.
- The professional can save and resume without losing progress.
- Issued licence information can be converted into a credential-verification workflow.
- Expiry and renewal reminders respect notification preferences and time zone.

## 6. Learning and CPD domain

### 6.1 Entities

- `EducationProviderProfile`: organization, verification, provider status, contacts, capabilities.
- `LearningProduct`: course/webinar, title, description, language, level, delivery, status, CPD metadata.
- `LearningProductVersion`: immutable published syllabus, outcomes, prerequisites, completion rules.
- `LearningSession`: schedule, time zone, delivery reference, instructor assignments, capacity.
- `Enrollment`: professional, product version/session, state, timestamps.
- `LearningProgress`: unit/progress percentage, source, updated time.
- `AttendanceRecord`: session, professional, status, evidence source, correction history.
- `Assessment`: versioned questions/rubric, pass threshold, attempt policy.
- `AssessmentAttempt`: answers/result, score, outcome, timestamps, integrity metadata.
- `Certificate`: immutable public verification reference, issuer, recipient, product version, issue/revocation.
- `CpdRecord`: activity, duration/credits, recognition level, evidence, jurisdiction relevance.

### 6.2 Publication rules

- Only verified organizations with education capability may submit content.
- Draft content is private to authorized provider members.
- Published versions are immutable; updates create a new version.
- Sponsorship and advertising are explicitly labelled.
- Claims about accreditation or authority recognition require evidence and approval.
- Content containing clinical cases must satisfy privacy, consent, de-identification, and editorial review.

### 6.3 Completion rules

- Enrollment pins the learning-product version.
- Completion derives only from declared completion requirements.
- Attendance correction preserves who changed it, why, and the prior value.
- Assessment attempts enforce availability, attempt limits, and scoring rules server-side.
- Certificates issue only after all completion conditions pass.
- Revocation does not delete the certificate; verification shows revoked status and reason category.
- CPD distinguishes self-declared, institution-confirmed, and authority-recognized records.

### 6.4 Professional acceptance criteria

- A professional can search by topic, species, speciality, language, delivery, level, and CPD relevance.
- Catalogue results never imply authority recognition without evidence.
- Product detail shows provider, version, outcomes, schedule, requirements, recognition, and source dates.
- Enrollment, progress, attendance, assessments, and completion work across desktop/mobile and English/Arabic layouts.
- A certificate has a non-guessable public verification identifier and privacy-safe verification page.
- Certificate and CPD evidence update the professional portfolio and relevant pathway readiness.

## 7. Frontend routes

### Professional

- `/licensing`
- `/licensing/pathways/[pathwayId]`
- `/learning`
- `/learning/courses/[courseId]`
- `/learning/webinars/[webinarId]`
- `/learning/my-learning`
- `/cpd`

### Provider

- `/education`
- `/education/catalog`
- `/education/courses/[courseId]`
- `/education/webinars/[webinarId]`
- `/education/learners`

### Trust operations

- `/review/licensing`
- `/review/licensing/pathways/[pathwayId]`

Routes are planned contracts, not authorization boundaries. API permissions remain authoritative.

## 8. Privacy and data classification

| Data | Classification | Default visibility |
|---|---|---|
| Regulatory sources/pathways | Public governed content | Public |
| Enrollment/progress/attempts | Personal confidential | Professional and authorized provider scope |
| Assessment answers | Restricted educational record | Professional and authorized grading scope |
| Certificate verification fields | Privacy-safe public evidence | Public by verification reference |
| CPD record | Professional evidence | Private; portfolio rules may expose summary |
| Linked credential evidence | Restricted evidence | Existing credential access policy |

## 9. Integration boundaries

- Video delivery, email/SMS, identity providers, government systems, equivalency/legalization providers, and proctoring remain adapters.
- External identifiers and payloads never become internal primary keys.
- Provider outages use retry/idempotency policies and show accurate user-facing status.
- No partner may receive evidence or professional data beyond the authorized purpose.

## 10. Non-functional requirements

- All mutation endpoints require idempotency where duplicate submission is plausible.
- Published catalogue reads target p95 below 500 ms under the approved pilot load.
- Pathway and certificate verification reads remain available during provider outages.
- Sensitive mutations are audited with actor, resource, reason, changes, correlation, and time.
- Accessibility targets WCAG 2.2 AA.
- English and Arabic copy, mirroring, date/number formatting, and truncation are release requirements.
- Backup, restore, retention, deletion, portability, monitoring, alerting, and support procedures must be documented before pilot.

## 11. Test strategy

- Unit tests for eligibility, requirement evaluation, completion, scoring, versioning, and transition invariants.
- Integration tests against PostgreSQL for transactions, uniqueness, evidence links, audit, and outbox.
- Authorization tests for professional, provider, instructor, curator, reviewer, and administrator boundaries.
- Contract tests for external adapters and idempotent retries.
- End-to-end tests for pathway enrollment, evidence reuse, course enrollment, attendance, assessment, certificate, CPD, and portfolio propagation.
- Visual regression for all principal routes at desktop/mobile and English/Arabic directions.
- Accessibility automation plus manual keyboard/screen-reader review for guided workflows.

## 12. Release gate

Phase 2 cannot exit pilot until at least one qualified country pathway owner and one verified education institution validate real workflows, data correctness, operational support, and user comprehension. Product availability must accurately distinguish pilot, governed content, partner integration, and unsupported jurisdictions.
