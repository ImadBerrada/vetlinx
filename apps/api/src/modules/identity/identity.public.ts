export const IDENTITY_PUBLIC_API = Symbol('IDENTITY_PUBLIC_API');

export type AccountStatus = 'pending' | 'active' | 'suspended' | 'closed';

export interface IdentityPublicApi {
  getAccountStatus(accountId: string): Promise<AccountStatus | null>;
}
