export const ORGANIZATIONS_PUBLIC_API = Symbol('ORGANIZATIONS_PUBLIC_API');

export interface OrganizationSummary {
  id: string;
  legalName: string;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
}

export interface OrganizationsPublicApi {
  findSummary(organizationId: string): Promise<OrganizationSummary | null>;
  findAccess(
    accountId: string,
    organizationId: string,
  ): Promise<{
    role: 'OWNER' | 'ADMIN' | 'RECRUITER' | 'STAFF';
    status:
      | 'DRAFT'
      | 'VERIFICATION_PENDING'
      | 'VERIFIED'
      | 'REJECTED'
      | 'SUSPENDED'
      | 'CLOSED';
  } | null>;
}
