import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trimUpper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class PathwaySearchQueryDto {
  @IsOptional()
  @Transform(trimUpper)
  @Matches(/^[A-Z]{2}$/)
  jurisdictionCode?: string;

  @IsOptional()
  @Transform(trimUpper)
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  licenceTypeCode?: string;
}

export class LinkRequirementCredentialDto {
  @IsUUID()
  credentialId!: string;
}

export class UpdateRequirementProgressDto {
  @IsIn(['IN_PROGRESS'])
  state!: 'IN_PROGRESS';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateExternalLicenceApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  authorityReference!: string;

  @IsDateString({ strict: true })
  submittedAt!: string;

  @IsIn(['SUBMITTED'])
  status!: 'SUBMITTED';
}

export class UpdateExternalLicenceApplicationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  authorityReference?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  submittedAt?: string;

  @IsOptional()
  @IsIn(['SUBMITTED', 'UNDER_REVIEW', 'REJECTED'])
  status?: 'SUBMITTED' | 'UNDER_REVIEW' | 'REJECTED';
}

export class UpdateLicensingReminderPreferencesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  timeZone!: string;

  @IsBoolean()
  renewalEnabled!: boolean;

  @IsIn([30, 60, 90, 120])
  leadDays!: 30 | 60 | 90 | 120;
}
