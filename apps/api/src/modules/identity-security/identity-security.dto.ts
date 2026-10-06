import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class SecurityTokenDto {
  @IsString()
  @Matches(/^[a-f0-9]{96}$/i)
  token!: string;
}

export class CompletePasswordResetDto extends SecurityTokenDto {
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
