import { Module } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { HttpModule } from '@nestjs/axios';
import { CrawlerController } from './crawler.controller';

@Module({
  imports: [HttpModule],
  controllers: [CrawlerController],
  providers: [CrawlerService],
  exports: [CrawlerService],
})
export class CrawlerModule {}
