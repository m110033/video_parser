import {
  Controller,
  Post,
  Res,
  Body,
  StreamableFile,
  Logger,
  Get,
  Header,
  Query,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import * as fs from 'fs';
import { Response } from 'express';
import { Anime1Service } from './anime1.service';
import { BaseController } from 'src/common/controller/base.controller';
import { Site } from 'src/common/enums/site.enum';
import { Anime1ParserDto } from './dto/anime1-parser.dto';

@Controller('anime1')
export class Anime1Controller extends BaseController {
  private readonly logger = new Logger(Anime1Controller.name);

  constructor(private readonly anime1Service: Anime1Service) {
    super();
  }

  @Post('info')
  getInfo(@Body() dto: Anime1ParserDto) {
    return this.anime1Service.parseAnime1VideoPage(dto);
  }

  @Post('parser')
  create(@Body() dto: Anime1ParserDto) {
    return this.anime1Service.getM3U8Dict(dto);
  }

  @Get('list')
  @Header('Content-Type', 'application/json')
  @Header('Content-Disposition', 'attachment; filename="gamer.json"')
  downloadList(@Res({ passthrough: true }) res: Response, @Query('debug') debug?: string) {
    const filePath = this.getGamerJsonPath(Site.ANIME1);

    try {
      if (!existsSync(filePath)) {
        throw new Error('JSON 檔案不存在');
      }

      const stats = fs.statSync(filePath);
      res.set({
        'Content-Length': stats.size,
      });
      const fileStream = createReadStream(filePath);
      return new StreamableFile(fileStream);
    } catch (error) {
      this.logger.error(`下載 JSON 檔案失敗: ${error.message}`);
      throw new Error('JSON 檔案不存在');
    }
  }
}
