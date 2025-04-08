import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SystemController } from './system.controller';
import { KeepAliveService } from './keep-alive.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpsProxyAgent } from 'https-proxy-agent';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProxyEnabled =
          configService.get<string>('IS_PROXY_ENABLED') === 'true';

        if (isProxyEnabled) {
          const host = configService.get<string>('PROXY_HOST');
          const port = parseInt(configService.get<string>('PROXY_PORT') || '0');
          const username = configService.get<string>('PROXY_USERNAME');
          const password = configService.get<string>('PROXY_PASSWORD');
          const proxyUrl = `http://${username}:${password}@${host}:${port}`;
          const httpsAgent = new HttpsProxyAgent(proxyUrl);
          return {
            httpsAgent,
            timeout: 20000,
            maxRedirects: 5,
          };
        }

        return {};
      },
    }),
  ],
  controllers: [SystemController],
  providers: [KeepAliveService],
})
export class SystemModule {}
