# Product capability catalogue

This catalogue normalizes the concepts in `VetLinX (2).pdf`. It describes product capabilities, not physical microservices or automatically approved scope.

## 1. Identity and access

| Capability | Persona | Phase | Notes |
|---|---|---:|---|
| Account registration and login | All | Current | One account entry point for every persona. |
| Professional onboarding | Professional | Current | Progressive profile completion after registration. |
| Owner onboarding | Animal owner | 3 | Adds an owner profile to an existing account. |
| Organization onboarding | Organization member | Current | Organization identity plus membership; not a company password. |
| Password authentication | All | Current | Password recovery remains required. |
| Email/phone verification | All | 2 | Contact verification is distinct from authentication. |
| MFA/authenticator application | All | 2 | TOTP or standards-based equivalent with recovery. |
| Passkeys/device biometrics | All | 2 | WebAuthn; VetLinX never receives biometric templates. |
| UAE Pass | UAE users | Partner | Official identity-provider integration only. |
| Session/device management | All | Current | View and revoke sessions; security audit. |

## 2. Professional identity and portfolio

| Capability | Phase | Notes |
|---|---:|---|
| Personal and contact profile | Current | Data minimization and field-level visibility. |
| Profile and cover media | 2 | Governed file upload, cropping, and accessibility. |
| Education and qualifications | Current | Structured institutions, degrees, dates, and evidence. |
| Professional licences | Current/2 | Credential wallet now; pathways and renewals in Phase 2. |
| Certifications | Current/2 | Verification and certificate propagation. |
| Professional experience | Current | Employment confirmation strengthens trusted history. |
| Recommendation letters | 2 | Evidence-backed references with issuer identity. |
| Volunteer/community activity | 2 | Declared or institution-confirmed contribution. |
| Skills and languages | Current | Controlled codes plus proficiency where needed. |
| Speciality and species experience | Current | Governed taxonomies, not free-text filters. |
| Public portfolio and CV | Current | Privacy, provenance, public slug, and export. |
| Open-to-work preferences | Current enhancement | Job title, location, work mode, shift, salary, visa, notice, relocation. |
| Accessibility/accommodation preferences | Current enhancement | Optional, private, purpose-limited, and never a public profile field. |

## 3. Credentials, verification, and licensing

| Capability | Phase | Notes |
|---|---:|---|
| Credential wallet | Current | Qualifications, licences, certifications, evidence, validity. |
| Verification workflow | Current | Evidence, reviewer assignment, decisions, expiry, revocation. |
| Authority directory | 2 | Country and subnational licensing authorities. |
| Versioned licence pathways | 2 | Requirements, source, effective dates, supersession. |
| Eligibility and readiness | 2 | Explainable requirement evaluation. |
| Evidence reuse | 2 | Link existing evidence; do not duplicate private files. |
| External application tracking | 2 | Reference, dates, status, user notes; no false submission claim. |
| Equivalency/legalization services | 2/Partner | DataFlow, equivalency, legalization, and translation as governed partners. |
| Renewal and expiry tracking | 2 | Notifications, renewal pathway, and portfolio status. |

## 4. Recruitment and employment

| Capability | Phase | Notes |
|---|---:|---|
| Organization vacancy management | Current | Draft, publish, close, structured requirements. |
| Candidate job discovery | Current | Search, filters, eligibility, and privacy. |
| Explainable matching | Current enhancement | Rank against explicit requirements and verified evidence. |
| Candidate-authorized application | Current | Candidate reviews and submits. |
| Auto-apply | Redesigned | Later opt-in only; explicit constraints, review, consent, and limits. |
| Application lifecycle | Current | Review, shortlist, interview, offer, rejection, withdrawal. |
| Interviews and offers | Current | Scheduling, terms, expiry, responses, notifications. |
| Employment confirmation | Current | Organization confirmation and trusted portfolio update. |
| Compensation structure | Current enhancement | Salary range, currency, frequency, allowance, benefit taxonomy. |
| Work conditions | Current enhancement | Employment type, mode, shift, duration, urgency, location. |
| Mobility and visa criteria | Current enhancement | Visa, notice, relocation, driving/transport requirements. |
| Professional role taxonomy | Current enhancement | Clinical, academic, industry, regulatory, research, and support roles. |

## 5. Organizations and facilities

| Capability | Phase | Notes |
|---|---:|---|
| Organization identity and verification | Current | Legal/public identity, evidence, reviewer decisions. |
| Memberships and invitations | Current | Owner, admin, recruiter, staff. |
| Branch/facility identity | 3 | Stable facility identity under an organization. |
| Departments and units | 3 | Configurable service units and departments. |
| Scoped facility RBAC | 3 | Organization, facility, department, record, and clinical scopes. |
| Staff and employee records | 3 | Employment relationship, roster, competence, and access lifecycle. |
| Company and partner records | 5 | Suppliers and industry partners with governed identity. |
| Administration, HR, finance, legal | 5 | Modular facility operations; integrate where ownership is not strategic. |

## 6. Owners, animals, appointments, and consent

| Capability | Phase | Notes |
|---|---:|---|
| Owner profile | 3 | Purpose-limited personal and contact data. |
| Animal identity | 3 | Species, breed, demographics, identifiers, ownership history. |
| Owner-animal relationship | 3 | Ownership/caretaker roles and effective dates. |
| Consent and authorization | 3 | Purpose, scope, beneficiary, expiry, withdrawal, audit. |
| Appointment and visit intake | 3 | Facility, service, practitioner, reason, status. |
| Minimal encounter | 3 | Encounter identity, practitioner, facility, animal, timing, summary. |
| Record sharing | 4 | Consent-based, audited, source-preserving access. |

## 7. Clinical operations

| Capability | Phase | Notes |
|---|---:|---|
| History and physical examination | 4 | Structured observations plus narrative. |
| Vital signs | 4 | Units, ranges, time, source, author. |
| Emergency and critical care | 4 | Acuity, handoff, timed observations, orders, outcomes. |
| Diagnosis/problem list | 4 | Coded and provisional/confirmed status. |
| Procedures and surgery | 4 | Indication, participants, evidence, outcome, complications. |
| Prescription and dispensing | 4 | Medication, dose, route, frequency, duration, author, legal checks. |
| Laboratory workflow | 4 | Order, specimen, collection, processing, result, interpretation. |
| Imaging workflow | 4 | Order, modality, study, media reference, report, interpretation. |
| Follow-up and discharge | 4 | Care plan, owner instructions, monitoring, next action. |
| Longitudinal record | 4 | Immutable provenance, corrections, timeline, access audit. |
| Pharmacy, inventory, store | 4/5 | Clinical stock linkage; procurement expands in Phase 5. |
| Boarding and grooming | 5 | Optional facility modules after core clinical validation. |

### Controlled laboratory categories

Hematology, clinical chemistry, urinalysis, parasitology, microbiology, serology, cytology, and histopathology are taxonomy values inside the laboratory workflow.

### Controlled imaging modalities

Ultrasound (B-mode, M-mode, color Doppler, spectral Doppler, 3D, 4D), radiography, CT, MRI, and PET are taxonomy values inside the imaging workflow. Modalities do not become separate applications.

## 8. Learning, events, library, and CPD

| Capability | Phase | Notes |
|---|---:|---|
| Verified education provider | 2 | Organization membership and provider permissions. |
| Course catalogue | 2 | Free and institution-sponsored at launch. |
| Webinar catalogue | 2 | Live and recorded delivery metadata. |
| Enrollment and progress | 2 | Save/resume and provider reporting. |
| Attendance | 2 | Source, session, evidence, and corrections. |
| Assessments and attempts | 2 | Versioned questions, score, pass rules, attempt policy. |
| Certificates | 2 | Issuer-verifiable, revocable, portfolio-linked. |
| CPD record | 2 | Self-declared, institution-confirmed, authority-recognized. |
| Events and workshops | 2 | Discovery and attendance; advertising visibly labelled. |
| Educational institution directory | 2 | Universities and training centers as organizations. |
| Professional library | 2 | Books, notes, question bank, case repository, surgery records, imaging gallery. |
| Clinical knowledge contribution | 2/4 | Governance, authorship, review status, privacy, and de-identification. |

## 9. Commerce, subscriptions, and intelligence

| Capability | Phase | Notes |
|---|---:|---|
| Free/premium/pro packages | 5 | Entitlements defined only after value and willingness-to-pay evidence. |
| Payments and refunds | 5/Partner | External payment provider; ledger and audit owned by VetLinX. |
| Provider payouts | 5/Partner | Separate regulated marketplace capability. |
| Operational analytics | 5 | Decision-linked metrics, never fabricated dashboard numbers. |
| Recruitment analytics | Current enhancement/5 | Funnel, time, quality, outcomes, and fairness monitoring. |
| Facility benchmarking | 5 | Governed, comparable, sufficiently dense datasets. |
| Workforce intelligence | 5 | De-identified and policy-controlled. |
| Epidemiology | 5 | Structured clinical data, governance, de-identification, quality gates. |
| Contextual AI | 5 | Explainable, supervised, and bounded by permissions and provenance. |

## 10. Shared navigation and public experience

| Capability | Phase | Notes |
|---|---:|---|
| Persona-aware workspace switcher | Current | Personal, organization, and trust workspaces. |
| Notifications | Current | Actionable, contextual, and permission-safe. |
| Network and search | 2/5 | Professional connections and governed cross-domain search. |
| Settings and help | Current enhancement | Security, privacy, language, accessibility, support. |
| Public company pages | 2 | About, contact, partners, terms, and privacy with content governance. |

## 11. Normalization rules

- Countries use ISO codes; currencies use ISO 4217 codes.
- Authorities, specialities, species, procedures, professional titles, employment types, work modes, shifts, benefits, laboratory categories, and imaging modalities have stable internal codes and localized labels.
- Regulatory content has source provenance, effective dates, review dates, jurisdiction, and owner.
- Sensitive demographic and health information is optional, private, purpose-limited, and never used for public ranking.
- Spelling variants in the source map are corrected during taxonomy curation, never copied as identifiers.
