import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GamerModule } from './modules/gamer/gamer.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 使配置在整個應用程序中可用
    }),
    GamerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
