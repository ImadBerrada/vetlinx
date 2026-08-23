import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class JobRequirementDto {
  @IsIn(['SPECIALTY', 'SPECIES', 'LICENCE', 'LANGUAGE', 'QUALIFICATION'])
  category!: 'SPECIALTY' | 'SPECIES' | 'LICENCE' | 'LANGUAGE' | 'QUALIFICATION';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  valueCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  label!: string;

  @IsBoolean()
  required!: boolean;
}

export class CreateJobDto {
  @IsString()
  @MinLength(4)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MinLength(30)
  @MaxLength(12000)
  description!: string;

  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city!: string;

  @IsIn(['FULL_TIME', 'PART_TIME', 'LOCUM', 'CONTRACT', 'INTERNSHIP'])
  employmentType!:
    'FULL_TIME' | 'PART_TIME' | 'LOCUM' | 'CONTRACT' | 'INTERNSHIP';

  @IsIn(['ON_SITE', 'HYBRID', 'REMOTE'])
  workMode!: 'ON_SITE' | 'HYBRID' | 'REMOTE';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  minExperienceYears!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMinMonthly?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMaxMonthly?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currencyCode?: string;

  @IsOptional()
  @IsDateString()
  closingAt?: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => JobRequirementDto)
  requirements!: JobRequirementDto[];
}

export class UpdateJobDto {
  @IsOptional() @IsString() @MinLength(4) @MaxLength(180) title?: string;
  @IsOptional()
  @IsString()
  @MinLength(30)
  @MaxLength(12000)
  description?: string;
  @IsOptional() @IsString() @Length(2, 2) countryCode?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) city?: string;
  @IsOptional()
  @IsIn(['FULL_TIME', 'PART_TIME', 'LOCUM', 'CONTRACT', 'INTERNSHIP'])
  employmentType?:
    'FULL_TIME' | 'PART_TIME' | 'LOCUM' | 'CONTRACT' | 'INTERNSHIP';
  @IsOptional()
  @IsIn(['ON_SITE', 'HYBRID', 'REMOTE'])
  workMode?: 'ON_SITE' | 'HYBRID' | 'REMOTE';
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  minExperienceYears?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) salaryMinMonthly?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) salaryMaxMonthly?: number;
  @IsOptional() @IsString() @Length(3, 3) currencyCode?: string;
  @IsOptional() @IsDateString() closingAt?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => JobRequirementDto)
  requirements?: JobRequirementDto[];
}

export class ApplyToJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  coverNote?: string;
}

export class UpdateApplicationStatusDto {
  @IsIn(['UNDER_REVIEW', 'SHORTLISTED', 'REJECTED'])
  status!: 'UNDER_REVIEW' | 'SHORTLISTED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class JobSearchQueryDto {
  @IsOptional() @IsString() @Length(2, 2) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional()
  @IsIn(['FULL_TIME', 'PART_TIME', 'LOCUM', 'CONTRACT', 'INTERNSHIP'])
  employmentType?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
}

export class CandidateSearchQueryDto {
  @IsOptional() @IsString() @Length(2, 2) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(60) credentialType?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
}

export class ScheduleInterviewDto {
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsString() @MinLength(1) @MaxLength(80) timeZone!: string;
  @IsIn(['VIDEO', 'PHONE', 'IN_PERSON']) mode!: 'VIDEO' | 'PHONE' | 'IN_PERSON';
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  joinUrl?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class UpdateInterviewStatusDto {
  @IsIn(['COMPLETED', 'CANCELLED']) status!: 'COMPLETED' | 'CANCELLED';
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class CreateOfferDto {
  @Type(() => Number) @IsInt() @Min(0) salaryMonthly!: number;
  @IsString() @Length(3, 3) currencyCode!: string;
  @IsDateString() proposedStartDate!: string;
  @IsDateString() expiresAt!: string;
  @IsString() @MinLength(20) @MaxLength(12000) terms!: string;
}

export class UpdateOfferDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) salaryMonthly?: number;
  @IsOptional() @IsString() @Length(3, 3) currencyCode?: string;
  @IsOptional() @IsDateString() proposedStartDate?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @MinLength(20) @MaxLength(12000) terms?: string;
}

export class RespondToOfferDto {
  @IsIn(['ACCEPTED', 'DECLINED']) status!: 'ACCEPTED' | 'DECLINED';
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class WithdrawOfferDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class EndEmploymentDto {
  @IsDateString() endDate!: string;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}
