import { Controller, Get } from '@nestjs/common';
import { CrawlerService } from './crawler.service';

@Controller('system')
export class CrawlerController {
  constructor(private readonly crawlerService: CrawlerService) {}

  @Get('proxy-test')
  async testProxy() {
    return await this.crawlerService.testProxy(true);
  }
}
