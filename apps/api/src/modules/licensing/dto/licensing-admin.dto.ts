import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimUpper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateLicensingJurisdictionDto {
  @Transform(trimUpper)
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  code!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameEn!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameAr!: string;
}

export class CreateLicensingAuthorityDto {
  @IsUUID()
  jurisdictionId!: string;

  @Transform(trimUpper)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  @MaxLength(100)
  code!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(250)
  nameEn!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(250)
  nameAr!: string;

  @Transform(trim)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  websiteUrl!: string;
}

export class CreateLicenceTypeDto {
  @Transform(trimUpper)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  @MaxLength(100)
  code!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameEn!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameAr!: string;

  @Transform(trimUpper)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  @MaxLength(100)
  professionalTitleCode!: string;
}

export class VerifiedCredentialRuleDto {
  @IsString()
  @Matches(/^VERIFIED_CREDENTIAL$/)
  kind!: 'VERIFIED_CREDENTIAL';

  @Transform(trimUpper)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  @MaxLength(120)
  credentialTypeCode!: string;

  @IsOptional()
  @Transform(trimUpper)
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;
}

export class PathwayRequirementDto {
  @Transform(trimUpper)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  @MaxLength(120)
  code!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(250)
  titleEn!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(250)
  titleAr!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  descriptionEn!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  descriptionAr!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  position!: number;

  @IsBoolean()
  required!: boolean;

  @ValidateNested()
  @Type(() => VerifiedCredentialRuleDto)
  rule!: VerifiedCredentialRuleDto;
}

export class PathwayVersionContentDto {
  @Transform(trim)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  sourceUrl!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  sourceTitle!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PathwayRequirementDto)
  requirements!: PathwayRequirementDto[];
}

export class CreateLicencePathwayDto extends PathwayVersionContentDto {
  @IsUUID()
  jurisdictionId!: string;

  @IsUUID()
  authorityId!: string;

  @IsUUID()
  licenceTypeId!: string;

  @Transform(trimLower)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(180)
  slug!: string;
}

export class CreatePathwayVersionDto extends PathwayVersionContentDto {}

export class UpdatePathwayVersionDto {
  @IsOptional()
  @Transform(trim)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  sourceUrl?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  sourceTitle?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string;

  @IsOptional()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PathwayRequirementDto)
  requirements?: PathwayRequirementDto[];
}
