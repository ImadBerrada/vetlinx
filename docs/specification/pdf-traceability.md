# `VetLinX (2).pdf` traceability matrix

This matrix accounts for the source map at a normalized capability level. Repeated labels and select-option values are grouped under their owning capability. Spelling errors are corrected in normalized names.

## Dispositions

- `CURRENT`: part of the active trusted-career implementation.
- `PHASE_2` through `PHASE_5`: gated future delivery.
- `PARTNER_INTEGRATION`: VetLinX owns the workflow boundary but not the external system.
- `REJECTED_OR_REDESIGNED`: source concept must not be implemented literally.

## Access and personas

| Source concepts | Normalized capability | Disposition | Decision |
|---|---|---|---|
| Access, Sign Up, Log In | Shared identity entry point | CURRENT | One login for all personas. |
| Professional | Professional profile onboarding | CURRENT | Progressive onboarding after account creation. |
| Animal Owner | Owner profile onboarding | PHASE_3 | Optional profile on the same account. |
| Company, Organization Account | Organization identity and membership | CURRENT | No shared company credential. |
| Branch Name 1/2, Abu Dhabi/Dubai Branch | Facility/branch identity | PHASE_3 | Stable facilities under organization. |
| User Account 1/2/3 | Organization memberships | REJECTED_OR_REDESIGNED | Real accounts joined through scoped membership. |
| Executive Leadership, Department Heads, Operational Management, Field and Execution Staff | Business title and permission assignment | PHASE_3 | Titles are separate from roles/permissions. |
| ID/password, email/phone | Password/contact authentication | CURRENT/PHASE_2 | Password current; verified contacts next. |
| UAE Pass | National identity integration | PARTNER_INTEGRATION | Official integration only. |
| Verification Code | Contact verification/MFA | PHASE_2 | Purpose-specific code with expiry/rate limits. |
| Fingerprint, Face Scan | Passkey/device biometric | REJECTED_OR_REDESIGNED | WebAuthn only; no biometric storage. |
| Google Authenticator | Authenticator-app MFA | PHASE_2 | Standards-based TOTP and recovery. |
| Name, prefix, gender, birth date, nationality, profession, address, email, phones, password fields | Progressive identity/profile fields | CURRENT/PHASE_3 | Collect only when purposeful; not all at signup. |

## Navigation and public experience

| Source concepts | Normalized capability | Disposition | Decision |
|---|---|---|---|
| Left Side Bar, Navigation Bar | Shared persona-aware application shell | CURRENT | One design system and workspace switcher. |
| Home, Notifications, My Profile | Core navigation | CURRENT | Contextual to workspace. |
| My Network | Professional network | PHASE_2 | Governed connections and discovery. |
| Search | Cross-domain search | PHASE_2/PHASE_5 | Scoped and permission-aware. |
| Settings, Help Center, Log Out | Account/support controls | CURRENT | Security/privacy/language/accessibility enhancements continue. |
| Contact Us, About Us, Our Partners, End Page | Governed public content | PHASE_2 | Common public site shell. |
| Feedbacks and Testimonials | Feedback/reputation evidence | PHASE_5 | Consent, moderation, provenance, and anti-gaming controls. |

## Professional identity

| Source concepts | Normalized capability | Disposition |
|---|---|---|
| Professional Identity Engine, Personal Profile, About | Professional profile/portfolio | CURRENT |
| Profile Photo, Cover Photo | Profile media | PHASE_2 |
| Education, qualification, degree, GPA, score | Structured education evidence | CURRENT |
| Certifications, Professional Licenses, MOCCAE | Credential wallet and licence evidence | CURRENT/PHASE_2 |
| Professional Experience | Employment history | CURRENT |
| Recommendation Letters | Evidence-backed references | PHASE_2 |
| Volunteer Work and Community Service | Contribution evidence | PHASE_2 |
| Skills: communication/clinical | Controlled skills | CURRENT enhancement |
| Languages, Arabic, English, Native, IELTS/TOEFL/PTE/DET/CELPIP and scores | Language proficiency evidence | PHASE_2 |
| Open to Work, expected salary, visa status, notice period, relocation | Private work preferences | CURRENT enhancement |
| Driving licence, own car | Optional job criteria/preference | CURRENT enhancement |
| Disability/chronic disease requiring care | Private accommodation preference | REJECTED_OR_REDESIGNED |

The disability/health concept becomes an optional, purpose-limited accommodation request and is excluded from public profiles and automated ranking.

## Professional and clinical taxonomies

| Source concepts | Normalized capability | Disposition |
|---|---|---|
| Small/large animals, equine, farm, exotic, avian/poultry, aquatic, laboratory, zoo/wildlife, invertebrates, general practitioner | Species/speciality taxonomy | CURRENT enhancement |
| Veterinary surgeon and soft-tissue/orthopedic branches | Professional/procedure taxonomy | CURRENT enhancement/PHASE_4 |
| Veterinarian, assistant/associate/head veterinarian, veterinary nurse/technician/lab/imaging/pharmacy roles | Professional title taxonomy | CURRENT enhancement |
| Groomer, trainer, handler, caretaker supervisor, receptionist | Animal-care/support title taxonomy | CURRENT enhancement |
| Teaching assistant, demonstrator, lecturer, assistant/associate/full professor | Academic title taxonomy | CURRENT enhancement |
| Medical representative, regulatory affairs, technical services, pharmacovigilance, QA | Industry title taxonomy | CURRENT enhancement |
| Inspectors, public health veterinarian, veterinary medical officer, epidemiologist | Regulatory/public-health title taxonomy | CURRENT enhancement |
| Research assistant/scientist, toxicologist, pharmacologist, dermatologist, physiotherapist | Research/specialist title taxonomy | CURRENT enhancement |
| Other | Governed extension request | REJECTED_OR_REDESIGNED |

“Other” is not a permanent analytics value. It creates a curated taxonomy-extension request while preserving user-entered text separately.

## Recruitment

| Source concepts | Normalized capability | Disposition |
|---|---|---|
| Veterinary Recruitment Engine/Career Portal | Recruitment workspace | CURRENT |
| Job Seeker Profiles, Job Offers | Candidate discovery and vacancies | CURRENT |
| Automatic Matching Engine | Explainable matching | CURRENT enhancement |
| Auto Apply | Candidate-authorized assisted application | REJECTED_OR_REDESIGNED |
| Job title, requirements, minimum experience by speciality | Structured job requirements | CURRENT enhancement |
| Full-time, part-time, contract, internship, volunteer, freelance/gig, permanent/temporary/duration | Employment taxonomy | CURRENT enhancement |
| On-site, remote, hybrid | Work-mode taxonomy | CURRENT enhancement |
| Flexible, fixed, rotating; day/evening/night/no preference | Shift taxonomy | CURRENT enhancement |
| Location and UAE emirates | Governed geography | CURRENT enhancement |
| MOCCAE licence, driving licence, car | Eligibility/operational requirements | CURRENT enhancement |
| Education, qualification, speciality, language criteria | Structured matching inputs | CURRENT enhancement |
| Visa types and notice period | Mobility/work-authorization data | CURRENT enhancement |
| Hiring urgently | Vacancy urgency with expiry | CURRENT enhancement |
| Basic salary, fixed/range, monthly/annual/hourly, currency | Compensation model | CURRENT enhancement |
| Housing, relocation, education, COLA, health, transport, car, petrol, hardship, uniform, mobile, food, on-call, overtime, liability, CPD, licensing, clinical/hazard allowances, retention/non-cash perks | Benefit taxonomy | CURRENT enhancement |

Currency source values are normalized to ISO 4217 codes; `EGY` is not retained as an identifier.

## Licensing pathways

| Source concepts | Normalized capability | Disposition |
|---|---|---|
| License Pathway | Versioned licence pathway | PHASE_2 |
| UAE, Egypt, Saudi Arabia, Qatar, GCC, USA, Canada, Germany, Austria, England, Europe, Australia, Morocco, North Africa | Jurisdiction catalogue | PHASE_2 |
| MOCCAE, Egyptian councils/syndicate/board, Emirates Veterinary Association | Authority directory | PHASE_2 |
| ADAFSA and UAE municipal/local authorities | Subnational authority configuration | PHASE_2 |
| DataFlow, QuadraBay, VFS Global, MOE equivalency | Equivalency/legalization workflow | PARTNER_INTEGRATION |
| Speciality-board categories listed under Egypt | Licensing speciality taxonomy | PHASE_2 |

Authority names, mandates, requirements, and URLs require qualified local review and dated source provenance before publication.

## Learning, events, and library

| Source concepts | Normalized capability | Disposition |
|---|---|---|
| Learning Hub | Learning and CPD workspace | PHASE_2 |
| Courses, theoretical, practical | Learning-product type/delivery | PHASE_2 |
| Conferences and Webinars, live/recorded | Webinar/event delivery | PHASE_2 |
| Events and Workshops, Ads | Events plus labelled sponsorship | PHASE_2 |
| Educational Institutes, Universities, Training Centers | Verified education providers | PHASE_2 |
| Cairo University, UAEU/CAVM, faculties/departments, named companies/labs | Organization/provider records | PHASE_2 |
| Library | Governed knowledge catalogue | PHASE_2 |
| Books, Notes, Question Bank | Content types | PHASE_2 |
| Clinical Cases Repository, Surgery Records | Governed/de-identified clinical learning content | PHASE_2/PHASE_4 |
| Imaging Gallery and listed modalities | Governed imaging learning content | PHASE_2/PHASE_4 |

## Facility workspace

| Source concepts | Normalized capability | Disposition |
|---|---|---|
| Clinic Workspace | Facility workspace | PHASE_3 |
| Branches | Facility topology | PHASE_3 |
| Modules | Facility entitlements/configuration | PHASE_3/PHASE_5 |
| Administration, reception, HR | Facility operations | PHASE_3/PHASE_5 |
| Finance, legal affairs | Partner/integrated business operations | PHASE_5/PARTNER_INTEGRATION |
| Employee Records | Staff identity/access/employment | PHASE_3 |
| Company Records | Partner/supplier identity | PHASE_5 |
| Patient Records, Owner Records | Animal/owner longitudinal identity | PHASE_3/PHASE_4 |
| Emergency/ICU, outpatient, inpatient, wards/isolation, surgery | Clinical units | PHASE_4 |
| Pharmacy, laboratory, radiology, store | Clinical operational units | PHASE_4 |
| Boarding, grooming | Optional facility modules | PHASE_5 |
| Ophthalmology, dentistry, routine health, vaccination, microchipping, customized unit | Service/unit taxonomy | PHASE_4/PHASE_5 |

## Clinical examination and records

| Source concepts | Normalized capability | Disposition |
|---|---|---|
| Clinical Examination | Encounter documentation | PHASE_4 |
| History | Clinical history | PHASE_4 |
| Physical Examination, Vital Signs | Structured observations | PHASE_4 |
| Emergency Medicine and Critical Care | Critical-care workflow | PHASE_4 |
| Consultation | Encounter/service type | PHASE_4 |
| Diagnostic Tools | Orders/results/reporting | PHASE_4 |
| Laboratory Tests | Laboratory workflow | PHASE_4 |
| Hematology, chemistry, urinalysis, parasitology, microbiology, serology, cytology, histopathology | Laboratory category taxonomy | PHASE_4 |
| Diagnostic Imaging | Imaging workflow | PHASE_4 |
| Ultrasound B/M/Doppler/3D/4D, X-ray, CT, MRI, PET | Imaging modality taxonomy | PHASE_4 |
| Prescription | Prescription/dispensing workflow | PHASE_4 |
| Surgical Procedures | Procedure/surgical episode | PHASE_4 |
| Follow Up | Care plan/follow-up workflow | PHASE_4 |

## Subscription, analytics, and administration

| Source concepts | Normalized capability | Disposition |
|---|---|---|
| Free, Premium, Pro | Entitlement/subscription packages | PHASE_5 |
| Analytics | Governed operational analytics | PHASE_5 |
| VetLinX Administration | Controlled platform operations | CURRENT enhancement/PHASE_5 |

Packages are not defined until validated outcomes and payer willingness establish meaningful entitlements.

## Source-quality corrections

The following source labels are corrected in user-facing content and taxonomy review: date of birth, country of residence, requirements, theoretical, IELTS, orthopedic, administration, and microchipping. Original spelling is not retained as an identifier.
