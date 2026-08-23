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
}
