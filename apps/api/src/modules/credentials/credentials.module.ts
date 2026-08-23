import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';
import { CREDENTIALS_PUBLIC_API } from './credentials.public';

@Module({
  imports: [IdentityModule, ProfessionalsModule],
  controllers: [CredentialsController],
  providers: [
    CredentialsService,
    { provide: CREDENTIALS_PUBLIC_API, useExisting: CredentialsService },
  ],
  exports: [CREDENTIALS_PUBLIC_API],
})
export class CredentialsModule {}
