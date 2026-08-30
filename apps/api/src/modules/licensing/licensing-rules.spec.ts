import {
  assertEnrollmentTransition,
  assertPathwayVersionTransition,
  evaluateRequirement,
} from './licensing-rules';

describe('licensing rules', () => {
  it('explains which verified credential satisfies a requirement', () => {
    expect(
      evaluateRequirement(
        {
          kind: 'VERIFIED_CREDENTIAL',
          credentialTypeCode: 'DEGREE',
          countryCode: 'EG',
        },
        [
          {
            id: 'credential-1',
            typeCode: 'DEGREE',
            countryCode: 'EG',
            status: 'VERIFIED',
            expiryDate: null,
          },
        ],
      ),
    ).toEqual({
      state: 'SATISFIED',
      credentialId: 'credential-1',
      explanation:
        'Verified DEGREE evidence from EG satisfies this requirement.',
    });
  });

  it('requires review instead of treating submitted evidence as verified', () => {
    expect(
      evaluateRequirement(
        { kind: 'VERIFIED_CREDENTIAL', credentialTypeCode: 'DEGREE' },
        [
          {
            id: 'credential-2',
            typeCode: 'DEGREE',
            countryCode: 'AE',
            status: 'SUBMITTED',
            expiryDate: null,
          },
        ],
      ),
    ).toEqual({
      state: 'NEEDS_REVIEW',
      credentialId: 'credential-2',
      explanation: 'Submitted DEGREE evidence from AE requires verification.',
    });
  });

  it('does not satisfy a requirement with expired or revoked evidence', () => {
    expect(
      evaluateRequirement(
        { kind: 'VERIFIED_CREDENTIAL', credentialTypeCode: 'LICENCE' },
        [
          {
            id: 'credential-expired',
            typeCode: 'LICENCE',
            countryCode: 'AE',
            status: 'VERIFIED',
            expiryDate: new Date('2020-01-01T00:00:00.000Z'),
          },
          {
            id: 'credential-revoked',
            typeCode: 'LICENCE',
            countryCode: 'AE',
            status: 'REVOKED',
            expiryDate: null,
          },
        ],
      ),
    ).toEqual({
      state: 'MISSING',
      explanation: 'No valid LICENCE evidence is available.',
    });
  });

  it('prevents a published pathway version returning to review', () => {
    expect(() =>
      assertPathwayVersionTransition('PUBLISHED', 'IN_REVIEW'),
    ).toThrow('Published pathway versions cannot return to review');
  });

  it('prevents approval before an external submission is recorded', () => {
    expect(() => assertEnrollmentTransition('ACTIVE', 'APPROVED')).toThrow(
      'ACTIVE cannot transition to APPROVED',
    );
  });
});
