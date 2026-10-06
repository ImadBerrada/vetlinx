import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
export class RevokeCredentialDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
