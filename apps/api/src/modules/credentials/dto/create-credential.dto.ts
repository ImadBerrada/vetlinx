import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export const CREDENTIAL_TYPE_CODES = [
  'DEGREE',
  'PROFESSIONAL_LICENCE',
  'CERTIFICATION',
] as const;

export class CreateCredentialDto {
  @ApiProperty({ enum: CREDENTIAL_TYPE_CODES })
  @IsIn(CREDENTIAL_TYPE_CODES)
  typeCode!: (typeof CREDENTIAL_TYPE_CODES)[number];

  @ApiProperty({ example: 'Doctor of Veterinary Medicine' })
  @IsString()
  @Length(2, 250)
  title!: string;

  @ApiProperty({ example: 'University of Sydney' })
  @IsString()
  @Length(2, 250)
  issuingOrganization!: string;

  @ApiProperty({ example: 'AE' })
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @ApiProperty({ example: '2022-06-30' })
  @IsDateString({ strict: true })
  issueDate!: string;

  @ApiPropertyOptional({ example: '2027-06-30' })
  @IsOptional()
  @IsDateString({ strict: true })
  expiryDate?: string;
}
