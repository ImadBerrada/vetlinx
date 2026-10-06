import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import {
  CompletePasswordResetDto,
  RequestPasswordResetDto,
  SecurityTokenDto,
} from './identity-security.dto';
import { IdentitySecurityService } from './identity-security.service';

@ApiTags('Identity security')
@Controller({ path: 'auth', version: '1' })
export class IdentitySecurityController {
  constructor(private readonly security: IdentitySecurityService) {}

  @Post('password-reset/request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestReset(@Body() dto: RequestPasswordResetDto, @Req() request: Request) {
    return this.security.requestPasswordReset(
      dto.email,
      this.correlationId(request),
    );
  }

  @Post('password-reset/complete')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  completeReset(
    @Body() dto: CompletePasswordResetDto,
    @Req() request: Request,
  ) {
    return this.security.completePasswordReset(
      dto.token,
      dto.password,
      this.correlationId(request),
    );
  }

  @Post('email-verification/request')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestVerification(@Req() request: AuthenticatedRequest) {
    return this.security.requestEmailVerification(
      request.user.accountId,
      this.correlationId(request),
    );
  }

  @Post('email-verification/complete')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  completeVerification(@Body() dto: SecurityTokenDto, @Req() request: Request) {
    return this.security.completeEmailVerification(
      dto.token,
      this.correlationId(request),
    );
  }

  @Get('security')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  securityStatus(@Req() request: AuthenticatedRequest) {
    return this.security.security(request.user.accountId);
  }

  @Get('sessions')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  sessions(@Req() request: AuthenticatedRequest) {
    return this.security.sessions(
      request.user.accountId,
      request.user.sessionFamilyId,
    );
  }

  @Delete('sessions/:sessionId')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  revoke(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.security.revokeSession(
      request.user.accountId,
      id,
      this.correlationId(request),
      request.user.sessionFamilyId,
    );
  }

  @Post('sessions/revoke-all')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  revokeAll(@Req() request: AuthenticatedRequest) {
    return this.security.revokeAll(
      request.user.accountId,
      this.correlationId(request),
    );
  }

  private correlationId(request: Request) {
    return request.header('x-correlation-id') || randomUUID();
  }
}
