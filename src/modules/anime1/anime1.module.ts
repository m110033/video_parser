import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { Anime1Controller } from './anime1.controller';
import { Anime1Service } from './anime1.service';
import { M3u8CacheService } from 'src/common/services/m3u8-cache.service';

@Module({
  imports: [HttpModule],
  controllers: [Anime1Controller],
  providers: [Anime1Service, M3u8CacheService],
})
export class Anime1Module {}
