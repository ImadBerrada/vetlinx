export type PathwayVersionStatus =
  'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'SUPERSEDED' | 'WITHDRAWN';

export type PathwayEnrollmentStatus =
  'ACTIVE' | 'SUBMITTED_EXTERNALLY' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

export type RequirementProgressState =
  'MISSING' | 'IN_PROGRESS' | 'SATISFIED' | 'NEEDS_REVIEW' | 'NOT_APPLICABLE';

export type RequirementRule = {
  kind: 'VERIFIED_CREDENTIAL';
  credentialTypeCode: string;
  countryCode?: string;
};

export interface CredentialEvidenceSummary {
  id: string;
  typeCode: string;
  countryCode: string;
  status:
    'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';
  expiryDate: Date | null;
}

export interface RequirementEvaluation {
  state: RequirementProgressState;
  credentialId?: string;
  explanation: string;
}
