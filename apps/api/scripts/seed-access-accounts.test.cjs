const test = require('node:test');
const assert = require('node:assert/strict');

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

  assert.equal(seeded.length, 5);
  assert.equal(seeded.every((account) => account.password && account.route.startsWith('/')), true);
});
