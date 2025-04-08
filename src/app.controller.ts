import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('video')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('list')
  getVideoList() {
    const list = {
      gamer: {
        list: 'gamer/list',
        parser: 'gamer/parser',
      },
      anime1: {
        list: 'anime1/list',
        parser: 'anime1/parser',
      },
    };
    return list;
  }
}
