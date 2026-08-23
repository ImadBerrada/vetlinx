import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import { PortfolioService } from './portfolio.service';

@ApiTags('Portfolio')
@Controller({ path: 'portfolio', version: '1' })
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get('public/:slug')
  getPublic(@Param('slug') slug: string) {
    return this.portfolio.getPublic(slug);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  getMine(@Req() request: AuthenticatedRequest) {
    return this.portfolio.getMine(request.user.accountId);
  }

  @Get('me/cv.txt')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  async downloadCv(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const cv = await this.portfolio.cvText(request.user.accountId);
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.setHeader(
      'content-disposition',
      `attachment; filename="${cv.filename}"`,
    );
    response.send(cv.content);
  }
}
