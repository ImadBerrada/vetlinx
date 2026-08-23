import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsISO31661Alpha2,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProfessionalProfileDto {
  @ApiProperty({ example: 'Dr. Amina Khaled' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  displayName!: string;

  @ApiProperty({ example: 'AE', minLength: 2, maxLength: 2 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  countryCode!: string;
}
