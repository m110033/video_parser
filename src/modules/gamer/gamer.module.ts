import { Module } from '@nestjs/common';
import { GamerController } from './gamer.controller';
import { GamerService } from './gamer.service';
import { CrawlerModule } from '../crawler/crawler.module';
import { AnimeService } from './anime.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProxyEnabled =
          configService.get<string>('IS_PROXY_ENABLED') === 'true';

        if (isProxyEnabled) {
          return {
            proxy: {
              host: configService.get<string>('PROXY_HOST') || '',
              port: parseInt(configService.get<string>('PROXY_PORT') || '0'),
              auth: {
                username: configService.get<string>('PROXY_USERNAME') || '',
                password: configService.get<string>('PROXY_PASSWORD') || '',
              },
            },
          };
        }

        return {};
      },
    }),
    CrawlerModule,
  ],
  controllers: [GamerController],
  providers: [GamerService, AnimeService],
})
export class GamerModule {}
