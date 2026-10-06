import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsBoolean() appointmentUpdatesEmail!: boolean;
  @IsBoolean() appointmentRemindersEmail!: boolean;
  @IsBoolean() credentialUpdatesEmail!: boolean;
  @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
}
