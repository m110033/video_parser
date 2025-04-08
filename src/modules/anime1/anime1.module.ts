import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { Anime1Controller } from './anime1.controller';
import { Anime1Service } from './anime1.service';

@Module({
  imports: [HttpModule],
  controllers: [Anime1Controller],
  providers: [Anime1Service],
})
export class Anime1Module {}
