import { Transform } from 'class-transformer';
import {
  Equals,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class RequestAppointmentDto {
  @IsUUID() requestId!: string;
  @IsUUID() petId!: string;
  @IsUUID() organizationId!: string;
  @IsDateString({ strict: true }) startsAt!: string;
  @IsString() @MaxLength(100) timeZone!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  visitReason!: string;
  @Equals(true, {
    message:
      'Agree to share the request details with this clinic before submitting',
  })
  sharingConsent!: boolean;
}

export class AppointmentDecisionDto {
  @IsIn(['CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED'])
  status!: 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED';
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class AppointmentProposalDto {
  @IsDateString({ strict: true }) startsAt!: string;
  @IsString() @MaxLength(100) timeZone!: string;
  @IsDateString({ strict: true }) expiresAt!: string;
  @IsInt() @Min(0) proposalVersion!: number;
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class AppointmentProposalResponseDto {
  @IsInt() @Min(1) proposalVersion!: number;
}
