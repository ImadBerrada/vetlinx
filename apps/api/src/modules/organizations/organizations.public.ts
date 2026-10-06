export const ORGANIZATIONS_PUBLIC_API = Symbol('ORGANIZATIONS_PUBLIC_API');

export interface PublicClinic {
  id: string;
  publicName: string | null;
  legalName: string;
  countryCode: string;
  city: string | null;
  addressLine1: string | null;
  phone: string | null;
  website: string | null;
  type: 'CLINIC' | 'HOSPITAL';
}

export interface ClinicSearch {
  q?: string;
  countryCode?: string;
  city?: string;
}

export interface OrganizationSummary {
  id: string;
  legalName: string;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
}

export interface OrganizationsPublicApi {
  findBookableClinic(organizationId: string): Promise<PublicClinic | null>;
  appointmentRecipients(organizationId: string): Promise<string[]>;
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
