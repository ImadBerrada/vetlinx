import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdentitySecurityController } from './identity-security.controller';
import { IdentitySecurityService } from './identity-security.service';
import { MfaController } from './mfa.controller';

@Module({
  imports: [IdentityModule, NotificationsModule],
  controllers: [IdentitySecurityController, MfaController],
  providers: [IdentitySecurityService],
})
export class IdentitySecurityModule {}
