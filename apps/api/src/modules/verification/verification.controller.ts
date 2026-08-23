import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
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
import { VerificationService } from './verification.service';

@ApiTags('Verification')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller({ path: 'verification-requests', version: '1' })
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'List verification requests owned by the authenticated professional',
  })
  listMine(@Req() request: AuthenticatedRequest) {
    return this.verification.listMine(request.user.accountId);
  }

  @Post('me/credentials/:credentialId')
  @ApiOperation({
    summary: 'Start evidence collection for a submitted credential',
  })
  createMine(
    @Param('credentialId', new ParseUUIDPipe()) credentialId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.verification.createMine(
      request.user.accountId,
      credentialId,
      request.header('x-correlation-id') || randomUUID(),
    );
  }

  @Post('me/:requestId/evidence')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Add a validated private evidence file' })
  addEvidence(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.verification.addEvidence(
      request.user.accountId,
      requestId,
      file,
      request.header('x-correlation-id') || randomUUID(),
    );
  }

  @Post('me/:requestId/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit collected evidence for review' })
  submitMine(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.verification.submitMine(
      request.user.accountId,
      requestId,
      request.header('x-correlation-id') || randomUUID(),
    );
  }
}
