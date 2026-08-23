export const PROFESSIONALS_PUBLIC_API = Symbol('PROFESSIONALS_PUBLIC_API');

export interface ProfessionalSummary {
  id: string;
  accountId: string;
  displayName: string;
  profileStatus: 'draft' | 'published' | 'suspended';
}

export interface ProfessionalsPublicApi {
  findSummary(professionalId: string): Promise<ProfessionalSummary | null>;
  findByAccountId(accountId: string): Promise<ProfessionalSummary | null>;
}
