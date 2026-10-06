export const IDENTITY_PUBLIC_API = Symbol('IDENTITY_PUBLIC_API');

export type AccountStatus = 'pending' | 'active' | 'suspended' | 'closed';

export interface IdentityPublicApi {
  /** Prunes at most 1,000 rows per artifact type after a 24-hour expiry grace; audits are retained. */
  pruneExpiredSecurityArtifacts(now?: Date): Promise<number>;
  getAccountStatus(accountId: string): Promise<AccountStatus | null>;
  findEmailRecipients(
    accountIds: string[],
  ): Promise<Array<{ accountId: string; email: string }>>;
}
