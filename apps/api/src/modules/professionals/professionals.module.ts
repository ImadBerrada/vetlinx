import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PROFESSIONALS_PUBLIC_API } from './professionals.public';
import { ProfessionalsController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';

@Module({
  imports: [IdentityModule],
  controllers: [ProfessionalsController],
  providers: [
    ProfessionalsService,
    { provide: PROFESSIONALS_PUBLIC_API, useExisting: ProfessionalsService },
  ],
  exports: [PROFESSIONALS_PUBLIC_API],
})
export class ProfessionalsModule {}
