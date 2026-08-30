import type {
  CredentialEvidenceSummary,
  PathwayEnrollmentStatus,
  PathwayVersionStatus,
  RequirementEvaluation,
  RequirementRule,
} from './licensing.types';

const PATHWAY_VERSION_TRANSITIONS: Record<
  PathwayVersionStatus,
  readonly PathwayVersionStatus[]
> = {
  DRAFT: ['IN_REVIEW', 'WITHDRAWN'],
  IN_REVIEW: ['DRAFT', 'PUBLISHED', 'WITHDRAWN'],
  PUBLISHED: ['SUPERSEDED', 'WITHDRAWN'],
  SUPERSEDED: [],
  WITHDRAWN: [],
};

const ENROLLMENT_TRANSITIONS: Record<
  PathwayEnrollmentStatus,
  readonly PathwayEnrollmentStatus[]
> = {
  ACTIVE: ['SUBMITTED_EXTERNALLY', 'WITHDRAWN'],
  SUBMITTED_EXTERNALLY: ['APPROVED', 'REJECTED', 'WITHDRAWN'],
  APPROVED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function assertPathwayVersionTransition(
  from: PathwayVersionStatus,
  to: PathwayVersionStatus,
): void {
  if (from === 'PUBLISHED' && to === 'IN_REVIEW') {
    throw new Error('Published pathway versions cannot return to review');
  }

  if (!PATHWAY_VERSION_TRANSITIONS[from].includes(to)) {
    throw new Error(`${from} cannot transition to ${to}`);
  }
}

export function assertEnrollmentTransition(
  from: PathwayEnrollmentStatus,
  to: PathwayEnrollmentStatus,
): void {
  if (!ENROLLMENT_TRANSITIONS[from].includes(to)) {
    throw new Error(`${from} cannot transition to ${to}`);
  }
}

export function evaluateRequirement(
  rule: RequirementRule,
  credentials: readonly CredentialEvidenceSummary[],
): RequirementEvaluation {
  const matchingCredentials = credentials.filter(
    (credential) =>
      credential.typeCode === rule.credentialTypeCode &&
      (!rule.countryCode || credential.countryCode === rule.countryCode),
  );

  const verifiedCredential = matchingCredentials.find(
    (credential) =>
      credential.status === 'VERIFIED' && !isExpired(credential.expiryDate),
  );

  if (verifiedCredential) {
    return {
      state: 'SATISFIED',
      credentialId: verifiedCredential.id,
      explanation: `Verified ${verifiedCredential.typeCode} evidence from ${verifiedCredential.countryCode} satisfies this requirement.`,
    };
  }

  const submittedCredential = matchingCredentials.find(
    (credential) => credential.status === 'SUBMITTED',
  );

  if (submittedCredential) {
    return {
      state: 'NEEDS_REVIEW',
      credentialId: submittedCredential.id,
      explanation: `Submitted ${submittedCredential.typeCode} evidence from ${submittedCredential.countryCode} requires verification.`,
    };
  }

  const draftCredential = matchingCredentials.find(
    (credential) => credential.status === 'DRAFT',
  );

  if (draftCredential) {
    return {
      state: 'IN_PROGRESS',
      credentialId: draftCredential.id,
      explanation: `Draft ${draftCredential.typeCode} evidence must be submitted for verification.`,
    };
  }

  return {
    state: 'MISSING',
    explanation: `No valid ${rule.credentialTypeCode} evidence is available.`,
  };
}

function isExpired(expiryDate: Date | null): boolean {
  return expiryDate !== null && expiryDate.getTime() < Date.now();
}
