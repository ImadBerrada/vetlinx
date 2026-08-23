import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfessionalProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) displayName?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  countryCode?: string;
  @IsOptional() @IsString() @MaxLength(220) headline?: string;
  @IsOptional() @IsString() @MaxLength(4000) summary?: string;
  @IsOptional() @IsIn(['PRIVATE', 'UNLISTED', 'PUBLIC']) visibility?:
    'PRIVATE' | 'UNLISTED' | 'PUBLIC';
  @IsOptional()
  @IsIn(['PRIVATE', 'VERIFIED_EMPLOYERS', 'PUBLIC'])
  contactVisibility?: 'PRIVATE' | 'VERIFIED_EMPLOYERS' | 'PUBLIC';
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Type(() => String)
  specialtyCodes?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Type(() => String)
  speciesCodes?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  @Type(() => String)
  languageCodes?: string[];
}
