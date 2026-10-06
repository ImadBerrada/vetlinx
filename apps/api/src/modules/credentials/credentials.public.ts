export const CREDENTIALS_PUBLIC_API = Symbol('CREDENTIALS_PUBLIC_API');

export interface OwnedCredentialSummary {
  id: string;
  professionalProfileId: string;
  status:
    'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';
}

export interface CredentialsPublicApi {
  findOwnedByAccount(
    accountId: string,
    credentialId: string,
  ): Promise<OwnedCredentialSummary | null>;
  expireDue(now?: Date): Promise<number>;
  findLifecycle(
    credentialId: string,
  ): Promise<CredentialLifecycleSnapshot | null>;
  revokeCredential(
    actorAccountId: string,
    credentialId: string,
    reason: string,
    correlationId: string,
    source: 'OPERATIONS' | 'ASSIGNED_REVIEWER',
    verificationRequestId?: string,
  ): Promise<CredentialLifecycleSnapshot>;
}

export interface CredentialLifecycleSnapshot extends OwnedCredentialSummary {
  effectiveStatus?: OwnedCredentialSummary['status'];
  typeCode: string;
  title: string;
  issuingOrganization: string;
  countryCode: string;
  issueDate: Date;
  expiryDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  lifecycleHistory: Array<{
    id: string;
    fromStatus: OwnedCredentialSummary['status'];
    toStatus: OwnedCredentialSummary['status'];
    reason: string;
    source: string;
    verificationRequestId: string | null;
    createdAt: Date;
  }>;
}
