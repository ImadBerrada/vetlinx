import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  const production = {
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'test-production-secret-with-more-than-32-characters',
    DELIVERY_ENCRYPTION_KEY: 'a1'.repeat(32),
  };

  it('allows explicitly disabled production email without SMTP credentials', () => {
    expect(
      validateEnvironment({ ...production, MAIL_TRANSPORT: 'disabled' })
        .MAIL_TRANSPORT,
    ).toBe('disabled');
  });

  it('still rejects production capture and incomplete SMTP configuration', () => {
    for (const MAIL_TRANSPORT of ['capture', 'smtp']) {
      expect(() =>
        validateEnvironment({ ...production, MAIL_TRANSPORT }),
      ).toThrow('Production email requires');
    }
  });

  it('requires the production encryption key even when email is disabled', () => {
    expect(() =>
      validateEnvironment({
        ...production,
        DELIVERY_ENCRYPTION_KEY: undefined,
        MAIL_TRANSPORT: 'disabled',
      }),
    ).toThrow('DELIVERY_ENCRYPTION_KEY is required');
  });

  it('provides safe local defaults', () => {
    expect(validateEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      FRONTEND_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://vetlinx:vetlinx_local@localhost:5432/vetlinx',
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      TRUST_PROXY: false,
      ENABLE_API_DOCS: true,
    });
  });

  it('parses proxy trust explicitly instead of treating false as truthy', () => {
    expect(validateEnvironment({ TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(
      false,
    );
    expect(validateEnvironment({ TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
  });

  it('can explicitly disable API documentation', () => {
    expect(
      validateEnvironment({ ENABLE_API_DOCS: 'false' }).ENABLE_API_DOCS,
    ).toBe(false);
  });

  it('converts a valid port from an environment string', () => {
    expect(validateEnvironment({ PORT: '4100' }).PORT).toBe(4100);
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnvironment({ PORT: 'not-a-port' })).toThrow();
  });

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() =>
      validateEnvironment({ DATABASE_URL: 'file:./local.db' }),
    ).toThrow();
  });

  it('rejects a short JWT signing secret', () => {
    expect(() => validateEnvironment({ JWT_ACCESS_SECRET: 'short' })).toThrow();
  });

  it('rejects the development signing secret in production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'JWT_ACCESS_SECRET must be changed in production',
    );
  });
});
