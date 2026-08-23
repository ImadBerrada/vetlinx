import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import {
  AcceptOrganizationInvitationDto,
  CreateOrganizationDto,
  InviteOrganizationMemberDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('me')
  listMine(@Req() request: AuthenticatedRequest) {
    return this.organizations.listMine(request.user.accountId);
  }

  @Post('me')
  createMine(
    @Body() dto: CreateOrganizationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.createMine(
      request.user.accountId,
      dto,
      this.correlationId(request),
    );
  }

  @Get('me/:organizationId')
  getMine(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.getMine(request.user.accountId, organizationId);
  }

  @Patch('me/:organizationId')
  updateMine(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() dto: UpdateOrganizationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.updateMine(
      request.user.accountId,
      organizationId,
      dto,
      this.correlationId(request),
    );
  }

  @Post('me/:organizationId/invitations')
  inviteMember(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() dto: InviteOrganizationMemberDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.inviteMember(
      request.user.accountId,
      organizationId,
      dto,
      this.correlationId(request),
    );
  }

  @Post('invitations/accept')
  @HttpCode(200)
  acceptInvitation(
    @Body() dto: AcceptOrganizationInvitationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.acceptInvitation(
      request.user.accountId,
      dto.token,
      this.correlationId(request),
    );
  }

  @Post('me/:organizationId/verification/evidence')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Add private organization verification evidence' })
  addEvidence(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.addVerificationEvidence(
      request.user.accountId,
      organizationId,
      file,
      this.correlationId(request),
    );
  }

  @Post('me/:organizationId/verification/submit')
  @HttpCode(200)
  submitVerification(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.submitVerification(
      request.user.accountId,
      organizationId,
      this.correlationId(request),
    );
  }

  private correlationId(request: AuthenticatedRequest) {
    return request.header('x-correlation-id') || randomUUID();
  }
}
