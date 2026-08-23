import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

const organizationTypes = [
  'CLINIC',
  'HOSPITAL',
  'LABORATORY',
  'UNIVERSITY',
  'COMPANY',
  'OTHER',
] as const;

export class CreateOrganizationDto {
  @ApiProperty({ maxLength: 250 })
  @IsString()
  @MinLength(2)
  @MaxLength(250)
  legalName!: string;

  @ApiProperty({ enum: organizationTypes })
  @IsIn(organizationTypes)
  type!: (typeof organizationTypes)[number];

  @ApiProperty({ example: 'AE' })
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @ApiPropertyOptional({ maxLength: 250 })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  publicName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({ maxLength: 250 })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  addressLine1?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  postalCode?: string;
}

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}

export class InviteOrganizationMemberDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ['ADMIN', 'RECRUITER', 'STAFF'] })
  @IsIn(['ADMIN', 'RECRUITER', 'STAFF'])
  role!: 'ADMIN' | 'RECRUITER' | 'STAFF';
}

export class AcceptOrganizationInvitationDto {
  @ApiProperty({ minLength: 32 })
  @IsString()
  @MinLength(32)
  @MaxLength(200)
  token!: string;
}

export class OrganizationDecisionReasonDto {
  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;
}

export class OrganizationDecisionNoteDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
