const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { config } = require('dotenv');
const argon2 = require('argon2');
const { Client } = require('pg');

const LOCAL_ACCESS_PASSWORD = 'VetLinX-Local-2026!';
const REQUIRED_PERSONAS = [
  'VETERINARIAN',
  'ORGANIZATION_OWNER',
  'ORGANIZATION_RECRUITER',
  'TRUST_REVIEWER',
  'PLATFORM_ADMINISTRATOR',
];

const ACCESS_ACCOUNTS = [
  {
    persona: 'VETERINARIAN',
    email: 'veterinarian@vetlinx.local',
    landingRoute: '/portfolio',
    systemRoles: ['PROFESSIONAL'],
  },
  {
    persona: 'ORGANIZATION_OWNER',
    email: 'owner@vetlinx.local',
    landingRoute: '/employer',
    systemRoles: ['PROFESSIONAL'],
    organizationRole: 'OWNER',
  },
  {
    persona: 'ORGANIZATION_RECRUITER',
    email: 'recruiter@vetlinx.local',
    landingRoute: '/employer/jobs',
    systemRoles: ['PROFESSIONAL'],
    organizationRole: 'RECRUITER',
  },
  {
    persona: 'TRUST_REVIEWER',
    email: 'reviewer@vetlinx.local',
    landingRoute: '/review',
    systemRoles: ['PROFESSIONAL', 'REVIEWER'],
  },
  {
    persona: 'PLATFORM_ADMINISTRATOR',
    email: 'admin@vetlinx.local',
    landingRoute: '/review',
    systemRoles: ['PROFESSIONAL', 'PLATFORM_ADMIN'],
  },
];

const IDS = {
  professionalProfile: '81000000-0000-4000-8000-000000000001',
  professionalCredential: '81000000-0000-4000-8000-000000000002',
  organization: '82000000-0000-4000-8000-000000000001',
  organizationVerification: '82000000-0000-4000-8000-000000000002',
};

function validateAccessAccounts(accounts) {
  const seen = new Set();
  for (const account of accounts) {
    const email = account.email?.trim().toLowerCase();
    if (seen.has(email)) throw new Error(`Duplicate email in access manifest: ${email}`);
    seen.add(email);
    if (!account.landingRoute?.startsWith('/')) {
      throw new Error(`Invalid landing route for ${account.persona}`);
    }
  }
  for (const persona of REQUIRED_PERSONAS) {
    if (!accounts.some((account) => account.persona === persona)) {
      throw new Error(`Missing access persona: ${persona}`);
    }
  }
}

async function upsertAccount(client, account, passwordHash) {
  const result = await client.query(
    `INSERT INTO identity.accounts (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, $3, 'ACTIVE', NOW())
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           status = 'ACTIVE',
           updated_at = NOW()
     RETURNING id`,
    [randomUUID(), account.email, passwordHash],
  );
  const accountId = result.rows[0].id;

  await client.query(
    `DELETE FROM identity.account_system_roles
     WHERE account_id = $1
       AND role IN ('PROFESSIONAL', 'REVIEWER', 'OPERATIONS_ADMIN', 'PLATFORM_ADMIN')`,
    [accountId],
  );
  for (const role of account.systemRoles) {
    await client.query(
      `INSERT INTO identity.account_system_roles (id, account_id, role, granted_by)
       VALUES ($1, $2, $3::identity."SystemRole", 'local-access-seed')`,
      [randomUUID(), accountId, role],
    );
  }
  return accountId;
}

async function seedProfessionalProfile(client, accountId) {
  await client.query(
    `INSERT INTO professionals.professional_profiles
       (id, account_id, display_name, country_code, status, headline, summary,
        public_slug, visibility, contact_visibility, specialty_codes, species_codes, language_codes, updated_at)
     VALUES
       ($1, $2, 'Dr. Layla Hassan', 'AE', 'ACTIVE',
        'Small Animal Veterinarian',
        'Licensed veterinarian focused on evidence-based companion-animal medicine, preventive care, and clear owner communication.',
        'dr-layla-hassan', 'PUBLIC', 'VERIFIED_EMPLOYERS',
        ARRAY['SMALL_ANIMAL_MEDICINE'], ARRAY['CANINE', 'FELINE'], ARRAY['AR', 'EN'], NOW())
     ON CONFLICT (account_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       country_code = EXCLUDED.country_code,
       status = EXCLUDED.status,
       headline = EXCLUDED.headline,
       summary = EXCLUDED.summary,
       public_slug = EXCLUDED.public_slug,
       visibility = EXCLUDED.visibility,
       contact_visibility = EXCLUDED.contact_visibility,
       specialty_codes = EXCLUDED.specialty_codes,
       species_codes = EXCLUDED.species_codes,
       language_codes = EXCLUDED.language_codes,
       updated_at = NOW()`,
    [IDS.professionalProfile, accountId],
  );

  await client.query(
    `INSERT INTO credentials.credentials
       (id, professional_profile_id, type_code, title, issuing_organization,
        country_code, issue_date, status, submitted_at, updated_at)
     VALUES
       ($1, $2, 'PROFESSIONAL_LICENCE', 'Veterinary Professional Licence',
        'United Arab Emirates Veterinary Authority', 'AE', DATE '2024-01-15',
        'VERIFIED', NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       professional_profile_id = EXCLUDED.professional_profile_id,
       title = EXCLUDED.title,
       issuing_organization = EXCLUDED.issuing_organization,
       country_code = EXCLUDED.country_code,
       issue_date = EXCLUDED.issue_date,
       status = EXCLUDED.status,
       submitted_at = EXCLUDED.submitted_at,
       updated_at = NOW()`,
    [IDS.professionalCredential, IDS.professionalProfile],
  );
}

async function seedOrganization(client, accountIds) {
  await client.query(
    `INSERT INTO organizations.organizations
       (id, legal_name, country_code, type, public_name, email, phone, website,
        address_line_1, city, region, postal_code, status, updated_at)
     VALUES
       ($1, 'VetLinX Clinical Partners LLC', 'AE', 'HOSPITAL',
        'VetLinX Veterinary Hospital', 'care@vetlinx.local', '+971 4 555 0188',
        'https://vetlinx.local', 'Dubai Healthcare District', 'Dubai', 'Dubai', '00000', 'VERIFIED', NOW())
     ON CONFLICT (id) DO UPDATE SET
       legal_name = EXCLUDED.legal_name,
       country_code = EXCLUDED.country_code,
       type = EXCLUDED.type,
       public_name = EXCLUDED.public_name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       website = EXCLUDED.website,
       address_line_1 = EXCLUDED.address_line_1,
       city = EXCLUDED.city,
       region = EXCLUDED.region,
       postal_code = EXCLUDED.postal_code,
       status = EXCLUDED.status,
       updated_at = NOW()`,
    [IDS.organization],
  );

  for (const account of ACCESS_ACCOUNTS.filter((item) => item.organizationRole)) {
    await client.query(
      `INSERT INTO organizations.organization_memberships
         (id, organization_id, account_id, role)
       VALUES ($1, $2, $3, $4::organizations."OrganizationMemberRole")
       ON CONFLICT (organization_id, account_id) DO UPDATE SET role = EXCLUDED.role`,
      [randomUUID(), IDS.organization, accountIds.get(account.persona), account.organizationRole],
    );
  }

  await client.query(
    `INSERT INTO organizations.organization_verification_requests
       (id, organization_id, status, assigned_reviewer_id, submitted_at, reviewed_at, updated_at)
     VALUES ($1, $2, 'VERIFIED', $3, NOW(), NOW(), NOW())
     ON CONFLICT (organization_id) DO UPDATE SET
       status = EXCLUDED.status,
       assigned_reviewer_id = EXCLUDED.assigned_reviewer_id,
       submitted_at = EXCLUDED.submitted_at,
       reviewed_at = EXCLUDED.reviewed_at,
       updated_at = NOW()`,
    [IDS.organizationVerification, IDS.organization, accountIds.get('TRUST_REVIEWER')],
  );
}

async function seedAccessAccounts() {
  validateAccessAccounts(ACCESS_ACCOUNTS);
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_ACCESS_SEED !== 'true') {
    throw new Error('Local access accounts cannot be seeded in production');
  }

  config({ path: resolve(__dirname, '..', '.env') });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required in apps/api/.env');

  const client = new Client({ connectionString: databaseUrl });
  const passwordHash = await argon2.hash(LOCAL_ACCESS_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const accountIds = new Map();

  await client.connect();
  try {
    await client.query('BEGIN');
    for (const account of ACCESS_ACCOUNTS) {
      accountIds.set(account.persona, await upsertAccount(client, account, passwordHash));
    }
    await seedProfessionalProfile(client, accountIds.get('VETERINARIAN'));
    await seedOrganization(client, accountIds);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  return ACCESS_ACCOUNTS.map((account) => ({
    persona: account.persona,
    email: account.email,
    password: LOCAL_ACCESS_PASSWORD,
    route: account.landingRoute,
  }));
}

if (require.main === module) {
  seedAccessAccounts()
    .then((accounts) => {
      console.table(accounts);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

module.exports = {
  ACCESS_ACCOUNTS,
  LOCAL_ACCESS_PASSWORD,
  seedAccessAccounts,
  validateAccessAccounts,
};
