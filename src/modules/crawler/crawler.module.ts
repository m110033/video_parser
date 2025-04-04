import { Module } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [CrawlerService],
  exports: [CrawlerService],
})
export class CrawlerModule {}
