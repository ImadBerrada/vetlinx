const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

const {
  ACCESS_ACCOUNTS,
  seedAccessAccounts,
  validateAccessAccounts,
} = require('./seed-access-accounts.cjs');

test('defines a routable local identity for every supported access persona', () => {
  assert.deepEqual(
    ACCESS_ACCOUNTS.map(({ persona, email, landingRoute }) => ({
      persona,
      email,
      landingRoute,
    })),
    [
      { persona: 'VETERINARIAN', email: 'veterinarian@vetlinx.local', landingRoute: '/portfolio' },
      { persona: 'ORGANIZATION_OWNER', email: 'owner@vetlinx.local', landingRoute: '/employer' },
      { persona: 'ORGANIZATION_RECRUITER', email: 'recruiter@vetlinx.local', landingRoute: '/employer/jobs' },
      { persona: 'TRUST_REVIEWER', email: 'reviewer@vetlinx.local', landingRoute: '/review' },
      { persona: 'LICENSING_CURATOR', email: 'licensing-curator@vetlinx.local', landingRoute: '/review/licensing' },
      { persona: 'LICENSING_REVIEWER', email: 'licensing-reviewer@vetlinx.local', landingRoute: '/review/licensing' },
      { persona: 'PLATFORM_ADMINISTRATOR', email: 'admin@vetlinx.local', landingRoute: '/review' },
    ],
  );
});

test('rejects access manifests with duplicate emails or missing persona access', () => {
  assert.throws(
    () => validateAccessAccounts([
      { persona: 'VETERINARIAN', email: 'same@vetlinx.local', landingRoute: '/portfolio' },
      { persona: 'VETERINARIAN', email: 'same@vetlinx.local', landingRoute: '/portfolio' },
    ]),
    /duplicate email/i,
  );

  assert.throws(
    () => validateAccessAccounts([]),
    /missing access persona/i,
  );
});

test('persists every local access identity as one atomic seed operation', async () => {
  const seeded = await seedAccessAccounts();
  await seedAccessAccounts();

  assert.equal(seeded.length, 7);
  assert.equal(seeded.every((account) => account.password && account.route.startsWith('/')), true);
  assert.equal(seeded.some((account) => account.persona === 'LICENSING_CURATOR'), true);
  assert.equal(seeded.some((account) => account.persona === 'LICENSING_REVIEWER'), true);

  config({ path: resolve(__dirname, '..', '.env') });
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const published = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM licensing.licence_pathway_versions version
       JOIN licensing.licence_pathways pathway ON pathway.id = version.pathway_id
       JOIN licensing.jurisdictions jurisdiction ON jurisdiction.id = pathway.jurisdiction_id
       JOIN licensing.licence_types licence_type ON licence_type.id = pathway.licence_type_id
       WHERE jurisdiction.code = 'AE' AND licence_type.code = 'VETERINARIAN'
         AND pathway.slug = 'uae-veterinary-professional-pilot' AND version.status = 'PUBLISHED'`,
    );
    const externalResults = await client.query(
      `SELECT COUNT(*)::int AS count FROM licensing.external_licence_applications
       WHERE enrollment_id = (SELECT id FROM licensing.pathway_enrollments WHERE professional_profile_id = $1 LIMIT 1)`,
      ['81000000-0000-4000-8000-000000000001'],
    );
    assert.equal(published.rows[0].count, 1);
    assert.equal(externalResults.rows[0].count, 0);
  } finally {
    await client.end();
  }
});
