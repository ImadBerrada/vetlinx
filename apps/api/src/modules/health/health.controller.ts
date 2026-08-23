import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../platform/persistence/prisma.service';

@ApiTags('Platform')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check API availability' })
  check() {
    return this.health.check([
      () =>
        Promise.resolve({
          api: {
            status: 'up',
            service: 'vetlinx-api',
            version: '0.1.0',
          },
        }),
      async () => {
        await this.prisma.$queryRaw`SELECT 1`;
        return { database: { status: 'up', provider: 'postgresql' } };
      },
    ]);
  }
}
