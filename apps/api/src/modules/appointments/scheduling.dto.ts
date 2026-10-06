import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateClinicServiceDto {
  @IsUUID() id!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description!: string;
  @IsInt() @Min(5) @Max(240) durationMinutes!: number;
}
export class UpdateClinicServiceDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description?: string;
  @IsOptional() @IsInt() @Min(5) @Max(240) durationMinutes?: number;
  @IsInt() @Min(0) version!: number;
  @IsBoolean() active!: boolean;
}
export class CreateAppointmentSlotDto {
  @IsUUID() id!: string;
  @IsUUID() serviceId!: string;
  @IsDateString({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/i)
  startsAt!: string;
  @IsString() @MaxLength(100) timeZone!: string;
  @IsInt() @Min(1) @Max(10) capacity!: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  resourceIds?: string[];
}
export class UpdateAppointmentSlotDto {
  @IsInt() @Min(0) version!: number;
  @IsBoolean() published!: boolean;
  @IsInt() @Min(1) @Max(10) capacity!: number;
  @IsOptional() @IsBoolean() releaseResources?: boolean;
}
export class CreateClinicResourceDto {
  @IsUUID() id!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
  @IsIn(['ROOM', 'EQUIPMENT', 'CARE_TEAM']) kind!: string;
}
export class UpdateClinicResourceDto {
  @IsInt() @Min(0) version!: number;
  @IsBoolean() active!: boolean;
}
export class ConfigureSchedulingDto {
  @IsBoolean() enabled!: boolean;
  @IsBoolean() expectedEnabled!: boolean;
}
export class CreateBookingHoldDto {
  @IsUUID() id!: string;
  @IsUUID() slotId!: string;
  @IsUUID() petId!: string;
}
export class AvailabilityQueryDto {
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() cursor?: string;
}
