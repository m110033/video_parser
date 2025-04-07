import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { GamerService } from './modules/gamer/gamer.service';
import { GamerModule } from './modules/gamer/gamer.module';
import { SystemModule } from './modules/system/system.module';
import { KeepAliveService } from './modules/system/keep-alive.service';
import { CrawlerModule } from './modules/crawler/crawler.module';
import { CrawlerService } from './modules/crawler/crawler.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new AllExceptionsFilter());

  const crawlerService = app.select(CrawlerModule).get(CrawlerService);
  await crawlerService.init();

  await app.listen(process.env.PORT ?? 3000);

  const gamerService = app.select(GamerModule).get(GamerService);

  const keepAliveService = app.select(SystemModule).get(KeepAliveService);

  await gamerService.crawlGamer(false);

  await keepAliveService.keepAlive();
}
bootstrap();
