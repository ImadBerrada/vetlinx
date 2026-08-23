import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module';
import { PrivateFilesModule } from '../../platform/files/private-files.module';
import { IdentityModule } from '../identity/identity.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { ReviewerVerificationController } from './reviewer-verification.controller';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [
    IdentityModule,
    ProfessionalsModule,
    CredentialsModule,
    PrivateFilesModule,
  ],
  controllers: [VerificationController, ReviewerVerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
