import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class MfaPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class MfaCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(80)
  code!: string;
}

export class MfaDisableDto extends MfaPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(80)
  code!: string;
}

export class MfaLoginDto extends MfaCodeDto {
  @IsString()
  @Matches(/^[a-f0-9]{96}$/)
  challengeToken!: string;
}
