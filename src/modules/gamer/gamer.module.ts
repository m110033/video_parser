import { Module } from '@nestjs/common';
import { GamerController } from './gamer.controller';
import { GamerService } from './gamer.service';
import { CrawlerModule } from '../crawler/crawler.module';
import { AnimeService } from './anime.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule, CrawlerModule],
  controllers: [GamerController],
  providers: [GamerService, AnimeService],
})
export class GamerModule {}
