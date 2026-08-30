import type { CredentialStatus } from '../../generated/prisma/enums';

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
  listOwnedEvidence(accountId: string): Promise<
    Array<{
      id: string;
      professionalProfileId: string;
      typeCode: string;
      countryCode: string;
      status: CredentialStatus;
      expiryDate: Date | null;
    }>
  >;
}
