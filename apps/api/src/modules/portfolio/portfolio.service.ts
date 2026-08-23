import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../platform/persistence/prisma.service';

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(accountId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { accountId },
      select: this.privateSelect(),
    });
    if (!profile) throw new NotFoundException('Professional profile not found');
    return { ...profile, trust: this.trustSummary(profile) };
  }

  async getPublic(slug: string) {
    const profile = await this.prisma.professionalProfile.findFirst({
      where: {
        publicSlug: slug,
        visibility: { in: ['PUBLIC', 'UNLISTED'] },
        status: 'ACTIVE',
      },
      select: this.publicSelect(),
    });
    if (!profile)
      throw new NotFoundException('Published professional portfolio not found');
    return {
      ...profile,
      email:
        profile.contactVisibility === 'PUBLIC' ? profile.account.email : null,
      account: undefined,
      trust: this.trustSummary(profile),
    };
  }

  async cvText(accountId: string) {
    const portfolio = await this.getMine(accountId);
    const lines = [
      portfolio.displayName,
      portfolio.headline,
      [portfolio.countryCode, portfolio.account.email]
        .filter(Boolean)
        .join(' | '),
      '',
      'PROFESSIONAL SUMMARY',
      portfolio.summary,
      '',
      'VERIFIED CREDENTIALS',
    ];
    for (const credential of portfolio.credentials)
      lines.push(
        `${credential.title} | ${credential.issuingOrganization} | ${credential.countryCode} | Issued ${this.date(credential.issueDate)}${credential.expiryDate ? ` | Expires ${this.date(credential.expiryDate)}` : ''}`,
      );
    lines.push('', 'VERIFIED EMPLOYMENT');
    for (const employment of portfolio.employments)
      lines.push(
        `${employment.title} | ${employment.organization.publicName ?? employment.organization.legalName} | ${this.date(employment.startDate)} - ${employment.endDate ? this.date(employment.endDate) : 'Present'} | ${employment.verificationSource}`,
      );
    if (portfolio.specialtyCodes.length)
      lines.push('', 'SPECIALTIES', portfolio.specialtyCodes.join(', '));
    if (portfolio.speciesCodes.length)
      lines.push('', 'SPECIES EXPERIENCE', portfolio.speciesCodes.join(', '));
    if (portfolio.languageCodes.length)
      lines.push('', 'LANGUAGES', portfolio.languageCodes.join(', '));
    lines.push(
      '',
      `VetLinX trust record: ${portfolio.credentials.length} verified credential(s), ${portfolio.employments.length} organization-confirmed employment record(s).`,
    );
    return {
      filename: `${portfolio.publicSlug ?? 'vetlinx-professional'}-cv.txt`,
      content: lines
        .filter((line): line is string => line !== null && line !== undefined)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n'),
    };
  }

  private privateSelect() {
    return {
      id: true,
      displayName: true,
      headline: true,
      summary: true,
      countryCode: true,
      status: true,
      publicSlug: true,
      visibility: true,
      contactVisibility: true,
      specialtyCodes: true,
      speciesCodes: true,
      languageCodes: true,
      createdAt: true,
      updatedAt: true,
      account: { select: { email: true } },
      credentials: {
        where: { status: 'VERIFIED' as const },
        select: {
          id: true,
          typeCode: true,
          title: true,
          issuingOrganization: true,
          countryCode: true,
          issueDate: true,
          expiryDate: true,
          status: true,
        },
        orderBy: { issueDate: 'desc' as const },
      },
      employments: {
        where: { status: { not: 'CANCELLED' as const } },
        select: {
          id: true,
          title: true,
          employmentType: true,
          startDate: true,
          endDate: true,
          status: true,
          verificationSource: true,
          organization: {
            select: {
              id: true,
              legalName: true,
              publicName: true,
              status: true,
            },
          },
        },
        orderBy: { startDate: 'desc' as const },
      },
    } as const;
  }
  private publicSelect() {
    return this.privateSelect();
  }
  private trustSummary(profile: {
    credentials: unknown[];
    employments: unknown[];
  }) {
    return {
      verifiedCredentialCount: profile.credentials.length,
      verifiedEmploymentCount: profile.employments.length,
      evidenceBacked:
        profile.credentials.length + profile.employments.length > 0,
    };
  }
  private date(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
