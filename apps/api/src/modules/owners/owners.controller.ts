import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import { CreatePetDto, OwnerProfileDto, UpdatePetDto } from './owners.dto';
import { OwnersService } from './owners.service';

@ApiTags('Pet owners')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller({ path: 'owners', version: '1' })
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @Get('me')
  async profile(@Req() request: AuthenticatedRequest) {
    const owner = await this.owners.getMine(request.user.accountId);
    if (!owner) throw new NotFoundException('Owner profile not found');
    return owner;
  }

  @Put('me')
  save(@Body() dto: OwnerProfileDto, @Req() request: AuthenticatedRequest) {
    return this.owners.saveProfile(
      request.user.accountId,
      dto,
      this.correlation(request),
    );
  }

  @Get('me/pets')
  pets(@Req() request: AuthenticatedRequest) {
    return this.owners.listPets(request.user.accountId);
  }

  @Post('me/pets')
  createPet(@Body() dto: CreatePetDto, @Req() request: AuthenticatedRequest) {
    return this.owners.createPet(
      request.user.accountId,
      dto,
      this.correlation(request),
    );
  }

  @Patch('me/pets/:petId')
  updatePet(
    @Param('petId', new ParseUUIDPipe()) petId: string,
    @Body() dto: UpdatePetDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.owners.updatePet(
      request.user.accountId,
      petId,
      dto,
      this.correlation(request),
    );
  }

  @Post('me/pets/:petId/archive')
  archivePet(
    @Param('petId', new ParseUUIDPipe()) petId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.owners.archivePet(
      request.user.accountId,
      petId,
      this.correlation(request),
    );
  }

  private correlation(request: AuthenticatedRequest) {
    return request.header('x-correlation-id') || randomUUID();
  }
}
