import { Module } from '@nestjs/common';
import { GamerController } from './gamer.controller';
import { GamerService } from './gamer.service';
import { CrawlerModule } from '../crawler/crawler.module';
import { AnimeService } from './anime.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule.register({
    timeout: 5000,
    headers: {
      'Host': 'ani.gamer.com.tw',
      'Origin': 'https://ani.gamer.com.tw',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.6',
      'Cache-Control': 'max-age=0',
    }
  }), CrawlerModule],
  controllers: [GamerController],
  providers: [GamerService, AnimeService],
})
export class GamerModule { }
