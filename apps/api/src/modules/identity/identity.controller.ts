import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { Throttle } from '@nestjs/throttler';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from './access-token.guard';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterAccountDto } from './dto/register-account.dto';
import { IdentityService } from './identity.service';
import type { RequestMetadata } from './identity.types';

@ApiTags('Identity')
@Controller({ path: 'auth', version: '1' })
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register an individual VetLinX account' })
  @ApiCreatedResponse({ description: 'Account and session created' })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(@Body() dto: RegisterAccountDto, @Req() request: Request) {
    return this.identity.register(
      dto.email,
      dto.password,
      this.metadata(request),
    );
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiOkResponse({ description: 'A new session was created' })
  @ApiUnauthorizedResponse({ description: 'Credentials are invalid' })
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.identity.login(dto.email, dto.password, this.metadata(request));
  }

  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a refresh token and issue a new session pair',
  })
  @ApiOkResponse({ description: 'Refresh token rotated' })
  @ApiUnauthorizedResponse({
    description: 'Refresh token is invalid or expired',
  })
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.identity.refresh(dto.refreshToken, this.metadata(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh session' })
  logout(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.identity.logout(dto.refreshToken, this.metadata(request));
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read the authenticated account identity' })
  @ApiOkResponse({ description: 'Authenticated account claims' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid',
  })
  me(@Req() request: AuthenticatedRequest) {
    return this.identity.getCurrentAccount(request.user.accountId);
  }

  private metadata(request: Request): RequestMetadata {
    const correlationHeader = request.header('x-correlation-id');
    return {
      correlationId: correlationHeader || randomUUID(),
      ipAddress: request.ip,
      userAgent: request.header('user-agent'),
    };
  }
}
