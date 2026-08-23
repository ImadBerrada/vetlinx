import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import { CreateProfessionalProfileDto } from './dto/create-professional-profile.dto';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';
import { ProfessionalsService } from './professionals.service';

@ApiTags('Professionals')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller({ path: 'professionals', version: '1' })
export class ProfessionalsController {
  constructor(private readonly professionals: ProfessionalsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Read the authenticated professional profile' })
  @ApiOkResponse({ description: 'Professional profile' })
  @ApiNotFoundResponse({ description: 'Profile has not been created' })
  async getMine(@Req() request: AuthenticatedRequest) {
    const profile = await this.professionals.getMine(request.user.accountId);
    if (!profile) throw new NotFoundException('Professional profile not found');
    return profile;
  }

  @Post('me')
  @ApiOperation({ summary: 'Create the authenticated professional profile' })
  @ApiCreatedResponse({ description: 'Professional profile created' })
  @ApiConflictResponse({ description: 'Profile already exists' })
  createMine(
    @Body() dto: CreateProfessionalProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const correlationId = request.header('x-correlation-id') || randomUUID();
    return this.professionals.createMine(
      request.user.accountId,
      dto.displayName,
      dto.countryCode,
      correlationId,
    );
  }

  @Patch('me')
  updateMine(
    @Body() dto: UpdateProfessionalProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.professionals.updateMine(
      request.user.accountId,
      dto,
      request.header('x-correlation-id') || randomUUID(),
    );
  }
}
