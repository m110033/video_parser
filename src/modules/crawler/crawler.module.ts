import { Module } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { HttpModule } from '@nestjs/axios';
import { CrawlerController } from './crawler.controller';
import { CrawlerCaptchaSolverService } from './crawler-captcha-solver.service';

@Module({
  imports: [HttpModule],
  controllers: [CrawlerController],
  providers: [CrawlerService, CrawlerCaptchaSolverService],
  exports: [CrawlerService, CrawlerCaptchaSolverService],
})
export class CrawlerModule {}
