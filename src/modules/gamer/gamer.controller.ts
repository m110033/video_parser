import { Controller, Post, Body } from '@nestjs/common';
import { GamerService } from './gamer.service';
import { GamerParserDto } from './dto/gamer-parser.dto';

@Controller('parser')
export class GamerController {
  constructor(private readonly gamerService: GamerService) {}

  @Post('gamer')
  async create(@Body() dto: GamerParserDto) {
    // 處理 POST 請求的邏輯
    return this.gamerService.parser(dto);
  }
}
