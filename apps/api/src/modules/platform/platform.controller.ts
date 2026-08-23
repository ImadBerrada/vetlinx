import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

const modules = [
  { key: 'identity', stage: 'foundation', deployment: 'api' },
  { key: 'professionals', stage: 'foundation', deployment: 'api' },
  { key: 'organizations', stage: 'foundation', deployment: 'api' },
  { key: 'credentials', stage: 'foundation', deployment: 'api' },
  { key: 'verification', stage: 'foundation', deployment: 'api' },
  { key: 'recruitment', stage: 'planned', deployment: 'api' },
  { key: 'employment', stage: 'planned', deployment: 'api' },
  { key: 'portfolio', stage: 'planned', deployment: 'api' },
  { key: 'audit', stage: 'foundation', deployment: 'api' },
] as const;

@ApiTags('Platform')
@Controller({ path: 'platform', version: '1' })
export class PlatformController {
  @Get('modules')
  @ApiOperation({ summary: 'List bounded contexts and implementation stage' })
  getModules() {
    return { architecture: 'modular-monolith', modules };
  }
}
