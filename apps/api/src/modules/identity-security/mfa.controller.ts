import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import { MfaCodeDto, MfaDisableDto, MfaPasswordDto } from './mfa.dto';
import { MfaService } from './mfa.service';

@ApiTags('Two-step verification')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller({ path: 'auth/mfa', version: '1' })
export class MfaController {
  constructor(private readonly mfa: MfaService) {}
  @Get()
  status(@Req() request: AuthenticatedRequest) {
    return this.mfa.status(
      request.user.accountId,
      request.user.sessionFamilyId!,
    );
  }
  @Post('setup')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  begin(@Body() dto: MfaPasswordDto, @Req() request: AuthenticatedRequest) {
    return this.mfa.begin(
      request.user.accountId,
      request.user.sessionFamilyId!,
      dto.password,
      this.correlation(request),
    );
  }
  @Post('confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirm(@Body() dto: MfaCodeDto, @Req() request: AuthenticatedRequest) {
    return this.mfa.confirm(
      request.user.accountId,
      request.user.sessionFamilyId!,
      dto.code,
      this.correlation(request),
    );
  }
  @Post('step-up')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  stepUp(@Body() dto: MfaCodeDto, @Req() request: AuthenticatedRequest) {
    return this.mfa.stepUp(
      request.user.accountId,
      request.user.sessionFamilyId!,
      dto.code,
      this.correlation(request),
    );
  }
  @Post('recovery-codes')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  recoveryCodes(
    @Body() dto: MfaDisableDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.mfa.regenerateRecoveryCodes(
      request.user.accountId,
      request.user.sessionFamilyId!,
      dto.code,
      dto.password,
      this.correlation(request),
    );
  }
  @Post('disable')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  disable(@Body() dto: MfaDisableDto, @Req() request: AuthenticatedRequest) {
    return this.mfa.disable(
      request.user.accountId,
      request.user.sessionFamilyId!,
      dto.code,
      dto.password,
      this.correlation(request),
    );
  }
  private correlation(request: AuthenticatedRequest) {
    return request.header('x-correlation-id') || randomUUID();
  }
}
