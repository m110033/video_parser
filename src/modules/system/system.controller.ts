import { Controller, Get } from '@nestjs/common';

@Controller('system')
export class SystemController {
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'video_parser',
    };
  }
}
