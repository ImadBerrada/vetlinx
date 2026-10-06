import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdentitySecurityController } from './identity-security.controller';
import { IdentitySecurityService } from './identity-security.service';

@Module({
  imports: [IdentityModule, NotificationsModule],
  controllers: [IdentitySecurityController],
  providers: [IdentitySecurityService],
})
export class IdentitySecurityModule {}
