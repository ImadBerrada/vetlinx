const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: resolve(process.cwd(), '.env') });

const [action, emailInput, roleInput, ...reasonParts] = process.argv.slice(2);
const allowedActions = new Set(['grant', 'revoke']);
const allowedRoles = new Set(['REVIEWER', 'OPERATIONS_ADMIN', 'PLATFORM_ADMIN']);

if (!allowedActions.has(action) || !emailInput || !allowedRoles.has(roleInput)) {
  console.error(
    'Usage: npm run role:manage -- <grant|revoke> <account-email> <REVIEWER|OPERATIONS_ADMIN|PLATFORM_ADMIN> [reason]',
  );
  process.exit(2);
}

const email = emailInput.trim().toLowerCase();
const reason = reasonParts.join(' ').trim() || 'Controlled local administration';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required in apps/api/.env');
  process.exit(2);
}

async function run() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    const accountResult = await client.query(
      'SELECT id FROM identity.accounts WHERE email = $1 AND status = \'ACTIVE\' LIMIT 1',
      [email],
    );
    if (accountResult.rowCount !== 1) {
      throw new Error('An active account with that email was not found');
    }
    const accountId = accountResult.rows[0].id;
    let changed = false;
    if (action === 'grant') {
      const result = await client.query(
        `INSERT INTO identity.account_system_roles
          (id, account_id, role, granted_by)
         VALUES ($1, $2, $3::identity."SystemRole", $4)
         ON CONFLICT (account_id, role) DO NOTHING`,
        [randomUUID(), accountId, roleInput, 'manage-system-role'],
      );
      changed = result.rowCount === 1;
    } else {
      const result = await client.query(
        `DELETE FROM identity.account_system_roles
         WHERE account_id = $1 AND role = $2::identity."SystemRole"`,
        [accountId, roleInput],
      );
      changed = result.rowCount === 1;
    }

    if (changed) {
      const now = new Date();
      await client.query(
        `INSERT INTO audit.audit_events
          (id, actor_id, action, resource_type, resource_id, occurred_at, correlation_id, reason, changes)
         VALUES ($1, $2, $3, 'account_system_role', $4, $5, $6, $7, $8::jsonb)`,
        [
          randomUUID(),
          'system:manage-role-cli',
          `identity.role.${action}ed`,
          `${accountId}:${roleInput}`,
          now,
          randomUUID(),
          reason,
          JSON.stringify({ accountId, role: roleInput, action }),
        ],
      );
    }
    await client.query('COMMIT');
    console.log(`${changed ? 'Role changed' : 'No change'}: ${email} ${roleInput}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
