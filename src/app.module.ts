import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GamerModule } from './modules/gamer/gamer.module';

@Module({
  imports: [GamerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
