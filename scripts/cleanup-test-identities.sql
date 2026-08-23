-- Development/test databases only. Removes identities created with reserved test domains.
BEGIN;

CREATE TEMP TABLE cleanup_accounts AS
SELECT id FROM identity.accounts
WHERE email LIKE '%@vetlinx.test' OR email LIKE '%@example.test';

CREATE TEMP TABLE cleanup_profiles AS
SELECT id FROM professionals.professional_profiles
WHERE account_id IN (SELECT id FROM cleanup_accounts);

CREATE TEMP TABLE cleanup_credentials AS
SELECT id FROM credentials.credentials
WHERE professional_profile_id IN (SELECT id FROM cleanup_profiles);

CREATE TEMP TABLE cleanup_requests AS
SELECT id FROM verification.verification_requests
WHERE professional_profile_id IN (SELECT id FROM cleanup_profiles);

CREATE TEMP TABLE cleanup_files AS
SELECT id FROM files.file_objects
WHERE owner_account_id IN (SELECT id FROM cleanup_accounts);

CREATE TEMP TABLE cleanup_organizations AS
SELECT DISTINCT organization_id AS id
FROM organizations.organization_memberships
WHERE account_id IN (SELECT id FROM cleanup_accounts);

CREATE TEMP TABLE cleanup_jobs AS
SELECT id FROM recruitment.jobs
WHERE organization_id IN (SELECT id FROM cleanup_organizations)
   OR created_by_account_id IN (SELECT id FROM cleanup_accounts);

CREATE TEMP TABLE cleanup_applications AS
SELECT id FROM recruitment.job_applications
WHERE job_id IN (SELECT id FROM cleanup_jobs)
   OR professional_profile_id IN (SELECT id FROM cleanup_profiles);

CREATE TEMP TABLE cleanup_offers AS
SELECT id FROM recruitment.job_offers
WHERE application_id IN (SELECT id FROM cleanup_applications);

CREATE TEMP TABLE cleanup_employments AS
SELECT id FROM recruitment.employments
WHERE professional_profile_id IN (SELECT id FROM cleanup_profiles)
   OR organization_id IN (SELECT id FROM cleanup_organizations)
   OR job_id IN (SELECT id FROM cleanup_jobs)
   OR offer_id IN (SELECT id FROM cleanup_offers);

CREATE TEMP TABLE cleanup_organization_requests AS
SELECT id FROM organizations.organization_verification_requests
WHERE organization_id IN (SELECT id FROM cleanup_organizations);

CREATE TEMP TABLE cleanup_resources (id text PRIMARY KEY);
INSERT INTO cleanup_resources SELECT id::text FROM cleanup_accounts ON CONFLICT DO NOTHING;
INSERT INTO cleanup_resources SELECT id::text FROM cleanup_profiles ON CONFLICT DO NOTHING;
INSERT INTO cleanup_resources SELECT id::text FROM cleanup_credentials ON CONFLICT DO NOTHING;
INSERT INTO cleanup_resources SELECT id::text FROM cleanup_requests ON CONFLICT DO NOTHING;
INSERT INTO cleanup_resources SELECT id::text FROM cleanup_files ON CONFLICT DO NOTHING;
INSERT INTO cleanup_resources SELECT id::text FROM cleanup_organizations ON CONFLICT DO NOTHING;
INSERT INTO cleanup_resources SELECT id::text FROM cleanup_jobs ON CONFLICT DO NOTHING;
INSERT INTO cleanup_resources SELECT id::text FROM cleanup_applications ON CONFLICT DO NOTHING;
INSERT INTO cleanup_resources SELECT id::text FROM cleanup_offers ON CONFLICT DO NOTHING;
INSERT INTO cleanup_resources SELECT id::text FROM cleanup_employments ON CONFLICT DO NOTHING;
INSERT INTO cleanup_resources SELECT id::text FROM cleanup_organization_requests ON CONFLICT DO NOTHING;

DELETE FROM audit.audit_events
WHERE actor_id IN (SELECT id FROM cleanup_resources)
   OR resource_id IN (SELECT id FROM cleanup_resources);
DELETE FROM platform.outbox_events
WHERE aggregate_id IN (SELECT id FROM cleanup_resources);
DELETE FROM recruitment.employment_history
WHERE employment_id IN (SELECT id FROM cleanup_employments);
DELETE FROM recruitment.employments
WHERE id IN (SELECT id FROM cleanup_employments);
DELETE FROM recruitment.interviews
WHERE application_id IN (SELECT id FROM cleanup_applications);
DELETE FROM recruitment.job_application_history
WHERE application_id IN (SELECT id FROM cleanup_applications);
DELETE FROM recruitment.job_offers
WHERE id IN (SELECT id FROM cleanup_offers);
DELETE FROM recruitment.job_applications
WHERE id IN (SELECT id FROM cleanup_applications);
DELETE FROM recruitment.job_requirements
WHERE job_id IN (SELECT id FROM cleanup_jobs);
DELETE FROM recruitment.jobs
WHERE id IN (SELECT id FROM cleanup_jobs);
DELETE FROM organizations.organization_verification_decisions
WHERE verification_request_id IN (SELECT id FROM cleanup_organization_requests);
DELETE FROM organizations.organization_verification_evidence
WHERE verification_request_id IN (SELECT id FROM cleanup_organization_requests);
DELETE FROM organizations.organization_verification_requests
WHERE id IN (SELECT id FROM cleanup_organization_requests);
DELETE FROM organizations.organization_invitations
WHERE organization_id IN (SELECT id FROM cleanup_organizations)
   OR email LIKE '%@vetlinx.test'
   OR email LIKE '%@example.test';
DELETE FROM organizations.organization_memberships
WHERE organization_id IN (SELECT id FROM cleanup_organizations)
   OR account_id IN (SELECT id FROM cleanup_accounts);
DELETE FROM organizations.organizations
WHERE id IN (SELECT id FROM cleanup_organizations);
DELETE FROM verification.verification_evidence
WHERE verification_request_id IN (SELECT id FROM cleanup_requests);
DELETE FROM verification.verification_decisions
WHERE verification_request_id IN (SELECT id FROM cleanup_requests);
DELETE FROM verification.verification_requests
WHERE id IN (SELECT id FROM cleanup_requests);
DELETE FROM credentials.credentials
WHERE id IN (SELECT id FROM cleanup_credentials);
DELETE FROM professionals.professional_profiles
WHERE id IN (SELECT id FROM cleanup_profiles);
DELETE FROM files.file_objects
WHERE id IN (SELECT id FROM cleanup_files);
DELETE FROM identity.accounts
WHERE id IN (SELECT id FROM cleanup_accounts);

COMMIT;
