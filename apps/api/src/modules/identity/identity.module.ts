import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from './access-token.guard';
import { Argon2PasswordHasher } from './argon2-password-hasher';
import { AuthTokenService } from './auth-token.service';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { IDENTITY_PUBLIC_API } from './identity.public';
import { PASSWORD_HASHER } from './password-hasher.port';
import { SystemRolesGuard } from './system-roles.guard';
import { MfaService } from '../identity-security/mfa.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [IdentityController],
  providers: [
    IdentityService,
    MfaService,
    AuthTokenService,
    AccessTokenGuard,
    SystemRolesGuard,
    Argon2PasswordHasher,
    { provide: PASSWORD_HASHER, useExisting: Argon2PasswordHasher },
    { provide: IDENTITY_PUBLIC_API, useExisting: IdentityService },
  ],
  exports: [
    JwtModule,
    AccessTokenGuard,
    SystemRolesGuard,
    IDENTITY_PUBLIC_API,
    PASSWORD_HASHER,
    MfaService,
  ],
})
export class IdentityModule {}
