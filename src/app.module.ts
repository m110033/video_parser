import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { M3u8CacheService } from './common/services/m3u8-cache.service';
import { GamerModule } from './modules/gamer/gamer.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SystemModule } from './modules/system/system.module';
import { Anime1Module } from './modules/anime1/anime1.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 使配置在整個應用程序中可用
    }),
    ScheduleModule.forRoot(),
    GamerModule,
    Anime1Module,
    SystemModule,
  ],
  controllers: [AppController],
  providers: [AppService, M3u8CacheService],
})
export class AppModule {}
