import 'reflect-metadata';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  IsBoolean,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum EnvironmentName {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(EnvironmentName)
  NODE_ENV: EnvironmentName = EnvironmentName.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  PORT = 4000;

  @IsUrl({ require_tld: false })
  FRONTEND_ORIGIN = 'http://localhost:3000';

  @Matches(/^postgres(?:ql)?:\/\//)
  DATABASE_URL = 'postgresql://vetlinx:vetlinx_local@localhost:5432/vetlinx';

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET =
    'local-development-secret-change-before-production-123456';

  @IsInt()
  @Min(60)
  @Max(86400)
  @Type(() => Number)
  JWT_ACCESS_TTL_SECONDS = 900;

  @IsInt()
  @Min(1)
  @Max(365)
  @Type(() => Number)
  REFRESH_TOKEN_TTL_DAYS = 30;

  @IsString()
  EVIDENCE_STORAGE_PATH = './var/evidence';

  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  TRUST_PROXY = false;

  @IsBoolean()
  @Transform(
    ({ value }) => value === undefined || value === true || value === 'true',
  )
  ENABLE_API_DOCS = true;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  if (
    validated.NODE_ENV === EnvironmentName.Production &&
    validated.JWT_ACCESS_SECRET ===
      'local-development-secret-change-before-production-123456'
  ) {
    throw new Error('JWT_ACCESS_SECRET must be changed in production');
  }

  return validated;
}
