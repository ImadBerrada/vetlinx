import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class OwnerProfileDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  displayName!: string;

  @Matches(/^[A-Za-z]{2}$/)
  countryCode!: string;

  @IsString()
  @Matches(/^\+?[0-9][0-9 ()-]{6,38}$/)
  phone!: string;
}

export class CreatePetDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsIn(['DOG', 'CAT', 'BIRD', 'RABBIT', 'HORSE', 'OTHER'])
  speciesCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  breed?: string;

  @IsIn(['FEMALE', 'MALE', 'UNKNOWN'])
  sex!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  birthDate?: string;
}

export class UpdatePetDto extends PartialType(CreatePetDto) {}
