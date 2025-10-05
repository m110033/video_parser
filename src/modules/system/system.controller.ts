import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('system')
export class SystemController {
  constructor(private readonly configService: ConfigService) {}
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'video_parser',
    };
  }

  @Get('catalog')
  catalogIndex() {
    const base = this.configService.get<string>('SERVICE_BASE_URL')?.replace(/\/$/, '') || '';
    const makeUrl = (path: string) => (base ? `${base}${path}` : path);
    return {
      updated: new Date().toISOString(),
      services: [
        {
          site: 'gamer',
          listUri: makeUrl('/gamer/list'),
          episodesEntry: makeUrl('/gamer/episodes?url='),
          m3u8Entry: makeUrl('/gamer/m3u8?url='),
        },
        {
          site: 'anime1',
          listUri: makeUrl('/anime1/list'),
          episodesEntry: makeUrl('/anime1/episodes?url='),
          m3u8Entry: makeUrl('/anime1/m3u8?url='),
        },
      ],
    };
  }
}
