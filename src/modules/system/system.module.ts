import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SystemController } from './system.controller';
import { KeepAliveService } from './keep-alive.service';

@Module({
  imports: [HttpModule],
  controllers: [SystemController],
  providers: [KeepAliveService],
})
export class SystemModule {}
