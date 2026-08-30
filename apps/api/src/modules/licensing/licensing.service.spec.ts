import { LicensingService } from './licensing.service';

describe('LicensingService', () => {
  it('builds readiness from owned credentials without copying evidence', async () => {
    const accountId = 'account-1';
    const pathwayId = 'pathway-1';
    const verifiedDegreeId = 'credential-1';
    const prisma = {
      licencePathway: {
        findUnique: jest.fn().mockResolvedValue({
          id: pathwayId,
          versions: [
            {
              id: 'version-1',
              version: 1,
              status: 'PUBLISHED',
              effectiveFrom: null,
              effectiveTo: null,
              requirements: [
                {
                  id: 'requirement-1',
                  code: 'VETERINARY_DEGREE',
                  titleEn: 'Veterinary degree',
                  titleAr: 'شهادة الطب البيطري',
                  descriptionEn: 'A verified degree is required.',
                  descriptionAr: 'يجب تقديم شهادة موثقة.',
                  position: 1,
                  required: true,
                  rule: {
                    kind: 'VERIFIED_CREDENTIAL',
                    credentialTypeCode: 'DEGREE',
                  },
                },
              ],
            },
          ],
        }),
      },
    };
    const credentials = {
      listOwnedEvidence: jest.fn().mockResolvedValue([
        {
          id: verifiedDegreeId,
          professionalProfileId: 'professional-1',
          typeCode: 'DEGREE',
          countryCode: 'AE',
          status: 'VERIFIED',
          expiryDate: null,
        },
      ]),
    };
    const professionals = {
      findByAccountId: jest.fn().mockResolvedValue({
        id: 'professional-1',
        accountId,
        displayName: 'Dr. Evidence Reuse',
        profileStatus: 'published',
      }),
    };
    const service = Reflect.construct(LicensingService, [
      prisma,
      {},
      {},
      credentials,
      professionals,
    ]) as LicensingService;

    const result = await service.previewEligibility(accountId, pathwayId);

    expect(result.requirements).toEqual([
      expect.objectContaining({
        code: 'VETERINARY_DEGREE',
        state: 'SATISFIED',
        credentialId: verifiedDegreeId,
      }),
    ]);
    expect(credentials.listOwnedEvidence).toHaveBeenCalledWith(accountId);
    expect(professionals.findByAccountId).toHaveBeenCalledWith(accountId);
  });
});
