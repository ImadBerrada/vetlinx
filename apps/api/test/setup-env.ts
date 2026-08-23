process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://vetlinx:vetlinx_local@localhost:5432/vetlinx_test?schema=public';
process.env.FRONTEND_ORIGIN ??= 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET ??=
  'automated-test-signing-secret-with-more-than-32-characters';
process.env.EVIDENCE_STORAGE_PATH ??= './var/evidence-test';
process.env.ENABLE_API_DOCS = 'false';
