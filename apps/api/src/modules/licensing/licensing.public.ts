export const LICENSING_PUBLIC_API = Symbol('LICENSING_PUBLIC_API');

export interface LicensingReadiness {
  enrollmentId: string;
  status: string;
  required: number;
  satisfied: number;
  needsReview: number;
  remaining: number;
  ready: boolean;
}

export interface LicensingPublicApi {
  findReadiness(
    accountId: string,
    enrollmentId: string,
  ): Promise<LicensingReadiness | null>;
}
