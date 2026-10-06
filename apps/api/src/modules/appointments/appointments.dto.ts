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
  Matches,
} from 'class-validator';

export class RequestAppointmentDto {
  @IsOptional() @IsUUID() holdId?: string;
  @IsUUID() requestId!: string;
  @IsUUID() petId!: string;
  @IsUUID() organizationId!: string;
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: 'Use an explicit UTC or numeric time offset',
  })
  @IsDateString({ strict: true })
  startsAt!: string;
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
  @IsIn(['CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'])
  status!: 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  @IsOptional() @IsInt() @Min(0) proposalVersion?: number;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class AppointmentProposalDto {
  @IsOptional() @IsUUID() slotId?: string;
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: 'Use an explicit UTC or numeric time offset',
  })
  @IsDateString({ strict: true })
  startsAt!: string;
  @IsString() @MaxLength(100) timeZone!: string;
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: 'Use an explicit UTC or numeric time offset',
  })
  @IsDateString({ strict: true })
  expiresAt!: string;
  @IsInt() @Min(0) proposalVersion!: number;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class AppointmentProposalResponseDto {
  @IsInt() @Min(1) proposalVersion!: number;
}

export class AppointmentRescheduleResponseDto extends AppointmentProposalResponseDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class AppointmentVersionDto {
  @IsInt() @Min(0) proposalVersion!: number;
}

export class AppointmentCancelDto {
  @IsOptional() @IsInt() @Min(0) proposalVersion?: number;
}
