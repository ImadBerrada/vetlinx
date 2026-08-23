import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import { CredentialsService } from './credentials.service';
import { CreateCredentialDto } from './dto/create-credential.dto';

@ApiTags('Credentials')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller({ path: 'credentials', version: '1' })
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get('me')
  @ApiOperation({
    summary: 'List credentials owned by the authenticated professional',
  })
  @ApiOkResponse({ description: 'Credential wallet entries' })
  listMine(@Req() request: AuthenticatedRequest) {
    return this.credentials.listMine(request.user.accountId);
  }

  @Post('me')
  @ApiOperation({ summary: 'Create a credential draft' })
  @ApiCreatedResponse({ description: 'Credential draft created' })
  createMine(
    @Body() dto: CreateCredentialDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.credentials.createMine(
      request.user.accountId,
      dto,
      request.header('x-correlation-id') || randomUUID(),
    );
  }

  @Post('me/:credentialId/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit a credential for evidence collection and review',
  })
  @ApiOkResponse({ description: 'Credential submitted' })
  submitMine(
    @Param('credentialId', new ParseUUIDPipe()) credentialId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.credentials.submitMine(
      request.user.accountId,
      credentialId,
      request.header('x-correlation-id') || randomUUID(),
    );
  }
}
