import type { Prisma } from '../../generated/prisma/client';

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
  appointmentSchedulingEnabled: boolean;
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
  /** Keeps clinic permission stable until the caller's transaction commits. */
  lockAppointmentAccess(
    tx: Prisma.TransactionClient,
    accountId: string,
    organizationId: string,
    management?: boolean,
  ): Promise<void>;
  lockBookableClinic(
    tx: Prisma.TransactionClient,
    organizationId: string,
    requireIntake?: boolean,
  ): Promise<PublicClinic | null>;
  configureAppointmentScheduling(
    accountId: string,
    organizationId: string,
    enabled: boolean,
    expectedEnabled: boolean,
    correlationId: string,
  ): Promise<{ enabled: boolean }>;
  findBookableClinic(organizationId: string): Promise<PublicClinic | null>;
  appointmentRecipients(organizationId: string): Promise<string[]>;
  findSummary(organizationId: string): Promise<OrganizationSummary | null>;
  findAccess(
    accountId: string,
    organizationId: string,
  ): Promise<{
    role: 'OWNER' | 'ADMIN' | 'RECRUITER' | 'STAFF';
    appointmentSchedulingEnabled: boolean;
    type:
      'CLINIC' | 'HOSPITAL' | 'LABORATORY' | 'UNIVERSITY' | 'COMPANY' | 'OTHER';
    status:
      | 'DRAFT'
      | 'VERIFICATION_PENDING'
      | 'VERIFIED'
      | 'REJECTED'
      | 'SUSPENDED'
      | 'CLOSED';
  } | null>;
}
