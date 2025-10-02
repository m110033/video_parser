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

  try {
    await crawlerService.init();
    await gamerService.crawlGamer();
    await anime1Service.crawler();
  } catch (error) {
    console.error('爬蟲執行過程中發生錯誤:', error);
  } finally {
    // 確保瀏覽器關閉
    await crawlerService.close();
    await app.close();
    console.log('爬蟲執行完成，程序結束');
    process.exit(0);
  }
}

bootstrap();
