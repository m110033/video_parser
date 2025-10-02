import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CrawlerService } from './modules/crawler/crawler.service';
import { GamerService } from './modules/gamer/gamer.service';
import { Anime1Service } from './modules/anime1/anime1.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const crawlerService = app.get(CrawlerService);
  const gamerService = app.get(GamerService);
  const anime1Service = app.get(Anime1Service);

  await crawlerService.init();
  await gamerService.crawlGamer();
  await anime1Service.crawler();

  await app.close();
}

bootstrap();
