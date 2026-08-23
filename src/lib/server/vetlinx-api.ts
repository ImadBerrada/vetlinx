import "server-only";

const API_URL = process.env.VETLINX_API_URL ?? "http://localhost:4000";

export interface ApiAccount {
  id: string;
  email: string;
  status: string;
  roles: ApiSystemRole[];
}

export type ApiSystemRole = "PROFESSIONAL" | "REVIEWER" | "OPERATIONS_ADMIN" | "PLATFORM_ADMIN";

export interface ApiAuthenticationResult {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  account: ApiAccount;
}

export interface ApiProfessionalProfile {
  id: string;
  displayName: string;
  countryCode: string;
  status: string;
  headline: string | null;
  summary: string | null;
  publicSlug: string | null;
  visibility: "PRIVATE" | "UNLISTED" | "PUBLIC";
  contactVisibility: "PRIVATE" | "VERIFIED_EMPLOYERS" | "PUBLIC";
  specialtyCodes: string[];
  speciesCodes: string[];
  languageCodes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiPortfolio extends Omit<ApiProfessionalProfile, "status"> {
  status: string;
  account?: { email: string };
  email?: string | null;
  credentials: Array<Pick<ApiCredential, "id" | "typeCode" | "title" | "issuingOrganization" | "countryCode" | "issueDate" | "expiryDate" | "status">>;
  employments: Array<Pick<ApiEmployment, "id" | "title" | "employmentType" | "startDate" | "endDate" | "status" | "verificationSource"> & { organization: Pick<ApiOrganization, "id" | "legalName" | "publicName" | "status"> }>;
  trust: { verifiedCredentialCount: number; verifiedEmploymentCount: number; evidenceBacked: boolean };
}

export interface ApiCredential {
  id: string;
  professionalProfileId: string;
  typeCode: "DEGREE" | "PROFESSIONAL_LICENCE" | "CERTIFICATION";
  title: string;
  issuingOrganization: string;
  countryCode: string;
  issueDate: string;
  expiryDate: string | null;
  status: "DRAFT" | "SUBMITTED" | "VERIFIED" | "REJECTED" | "EXPIRED" | "REVOKED";
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiVerificationEvidence {
  id: string;
  fileObjectId: string;
  kind: string;
  createdAt: string;
  file: {
    id: string;
    originalName: string;
    mediaType: string;
    byteSize: number;
    validationStatus: "VALIDATED" | "QUARANTINED";
  } | null;
}

export interface ApiVerificationRequest {
  id: string;
  credentialId: string;
  professionalProfileId: string;
  status:
    | "EVIDENCE_REQUIRED"
    | "READY_TO_SUBMIT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "NEEDS_INFORMATION"
    | "VERIFIED"
    | "REJECTED"
    | "CANCELLED";
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  evidence: ApiVerificationEvidence[];
  decisions: Array<{
    id: string;
    action: "NEEDS_INFORMATION" | "VERIFIED" | "REJECTED";
    reason: string | null;
    createdAt: string;
  }>;
}

export interface ApiNotification {
  id: string;
  kind:
    | "VERIFICATION_INFORMATION_REQUESTED"
    | "CREDENTIAL_VERIFIED"
    | "CREDENTIAL_REJECTED"
    | "ORGANIZATION_INFORMATION_REQUESTED"
    | "ORGANIZATION_VERIFIED"
    | "ORGANIZATION_REJECTED"
    | "JOB_APPLICATION_RECEIVED"
    | "JOB_APPLICATION_STATUS_UPDATED"
    | "INTERVIEW_SCHEDULED"
    | "INTERVIEW_UPDATED"
    | "OFFER_RECEIVED"
    | "OFFER_UPDATED"
    | "EMPLOYMENT_CONFIRMED"
    | "EMPLOYMENT_ENDED";
  status: "UNREAD" | "READ";
  title: string;
  message: string;
  resourceType: string;
  resourceId: string;
  readAt: string | null;
  createdAt: string;
}

export type ApiJobStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED";
export type ApiEmploymentType = "FULL_TIME" | "PART_TIME" | "LOCUM" | "CONTRACT" | "INTERNSHIP";
export type ApiWorkMode = "ON_SITE" | "HYBRID" | "REMOTE";
export type ApiApplicationStatus = "SUBMITTED" | "UNDER_REVIEW" | "SHORTLISTED" | "INTERVIEWING" | "OFFERED" | "REJECTED" | "WITHDRAWN" | "HIRED";

export interface ApiJobRequirement {
  id: string;
  category: "SPECIALTY" | "SPECIES" | "LICENCE" | "LANGUAGE" | "QUALIFICATION";
  valueCode: string;
  label: string;
  required: boolean;
}

export interface ApiJob {
  id: string;
  organizationId: string;
  createdByAccountId: string;
  title: string;
  description: string;
  countryCode: string;
  city: string;
  employmentType: ApiEmploymentType;
  workMode: ApiWorkMode;
  minExperienceYears: number;
  salaryMinMonthly: number | null;
  salaryMaxMonthly: number | null;
  currencyCode: string | null;
  status: ApiJobStatus;
  publishedAt: string | null;
  closingAt: string | null;
  createdAt: string;
  updatedAt: string;
  requirements: ApiJobRequirement[];
  organization?: { id?: string; legalName: string; publicName: string | null; status?: ApiOrganizationStatus };
  _count?: { applications: number };
}

export interface ApiJobApplication {
  id: string;
  jobId: string;
  professionalProfileId: string;
  coverNote: string | null;
  status: ApiApplicationStatus;
  submittedAt: string;
  updatedAt: string;
  history: Array<{ id: string; fromStatus: ApiApplicationStatus | null; toStatus: ApiApplicationStatus; reason: string | null; createdAt: string }>;
  professional?: { id: string; displayName: string; countryCode: string; status: string; account: { email: string } };
  job?: ApiJob;
  interviews?: ApiInterview[];
  offers?: Array<ApiJobOffer & { employment?: ApiEmployment | null }>;
}

export interface ApiCandidate {
  id: string;
  displayName: string;
  countryCode: string;
  status: string;
  account: { email: string };
  verifiedCredentials: Array<{ id: string; typeCode: string; title: string; issuingOrganization: string; countryCode: string; expiryDate: string | null }>;
}

export interface ApiInterview {
  id: string;
  applicationId: string;
  scheduledByAccountId: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  mode: "VIDEO" | "PHONE" | "IN_PERSON";
  location: string | null;
  joinUrl: string | null;
  notes: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  application?: { id: string; job: { id: string; title: string; organization: { legalName: string; publicName: string | null } } };
}

export interface ApiJobOffer {
  id: string;
  applicationId: string;
  createdByAccountId: string;
  salaryMonthly: number;
  currencyCode: string;
  proposedStartDate: string;
  expiresAt: string;
  terms: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "EXPIRED";
  sentAt: string | null;
  respondedAt: string | null;
  responseReason: string | null;
  createdAt: string;
  updatedAt: string;
  application?: { id: string; job: { id: string; title: string; organization: { legalName: string; publicName: string | null } } };
}

export interface ApiEmployment {
  id: string;
  offerId: string;
  jobId: string;
  organizationId: string;
  professionalProfileId: string;
  confirmedByAccountId: string;
  title: string;
  employmentType: ApiEmploymentType;
  startDate: string;
  endDate: string | null;
  status: "CONFIRMED" | "ACTIVE" | "ENDED" | "CANCELLED";
  verificationSource: "ORGANIZATION_CONFIRMED";
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
  organization?: ApiOrganization;
  professional?: { id: string; displayName: string; countryCode: string; account: { email: string } };
  history?: Array<{ id: string; fromStatus: ApiEmployment["status"] | null; toStatus: ApiEmployment["status"]; reason: string | null; createdAt: string }>;
}

export type ApiOrganizationStatus = "DRAFT" | "VERIFICATION_PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED" | "CLOSED";
export type ApiOrganizationRole = "OWNER" | "ADMIN" | "RECRUITER" | "STAFF";

export interface ApiOrganization {
  id: string;
  legalName: string;
  publicName: string | null;
  type: "CLINIC" | "HOSPITAL" | "LABORATORY" | "UNIVERSITY" | "COMPANY" | "OTHER";
  countryCode: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  status: ApiOrganizationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApiOrganizationVerification {
  id: string;
  organizationId: string;
  status: "EVIDENCE_REQUIRED" | "READY_TO_SUBMIT" | "SUBMITTED" | "UNDER_REVIEW" | "NEEDS_INFORMATION" | "VERIFIED" | "REJECTED";
  assignedReviewerId: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  evidence: ApiVerificationEvidence[];
  decisions: Array<{ id: string; action: "NEEDS_INFORMATION" | "VERIFIED" | "REJECTED"; reason: string | null; createdAt: string }>;
}

export interface ApiOrganizationWorkspace {
  organization: ApiOrganization;
  membership: { id: string; role: ApiOrganizationRole };
  members: Array<{
    id: string;
    role: ApiOrganizationRole;
    createdAt: string;
    account: { id: string; email: string; status: string };
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: ApiOrganizationRole;
    status: string;
    expiresAt: string;
    createdAt: string;
  }>;
  verification: ApiOrganizationVerification;
}

export interface ApiOrganizationMembershipSummary {
  id: string;
  role: ApiOrganizationRole;
  createdAt: string;
  organization: ApiOrganization;
}

export interface ApiOrganizationReview extends ApiOrganizationVerification {
  organization: ApiOrganization;
  auditTrail: Array<{
    id: string;
    actorId: string;
    action: string;
    occurredAt: string;
    reason: string | null;
    changes: unknown;
  }>;
}

export interface ApiReviewQueueItem {
  id: string;
  status: "SUBMITTED" | "UNDER_REVIEW";
  submittedAt: string;
  updatedAt: string;
  assignedReviewerId: string | null;
  evidenceCount: number;
  professional: {
    id: string;
    displayName: string;
    countryCode: string;
    account: { email: string };
  } | null;
  credential: {
    id: string;
    typeCode: string;
    title: string;
    issuingOrganization: string;
    countryCode: string;
    status: ApiCredential["status"];
    expiryDate: string | null;
  } | null;
}

export interface ApiVerificationReview extends ApiVerificationRequest {
  assignedReviewerId: string | null;
  reviewedAt: string | null;
  professional: {
    id: string;
    displayName: string;
    countryCode: string;
    status: string;
    account: { email: string };
  } | null;
  credential: ApiCredential | null;
  decisions: Array<{
    id: string;
    action: "NEEDS_INFORMATION" | "VERIFIED" | "REJECTED";
    reason: string | null;
    createdAt: string;
  }>;
  auditTrail: Array<{
    id: string;
    actorId: string;
    action: string;
    occurredAt: string;
    reason: string | null;
    changes: unknown;
  }>;
}

export function callApi(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...init?.headers,
    },
  });
}

export async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function apiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = await readJson<{ message?: string | string[] }>(response);
  if (Array.isArray(body?.message)) return body.message[0] ?? fallback;
  return body?.message ?? fallback;
}
