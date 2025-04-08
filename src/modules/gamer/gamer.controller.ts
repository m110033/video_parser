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
import { GamerService } from './gamer.service';
import { GamerParserDto } from './dto/gamer-parser.dto';
import { createReadStream, existsSync } from 'fs';
import * as fs from 'fs';
import { Response } from 'express';
import { AnimeService } from './anime.service';
import { BaseController } from 'src/common/controller/base.controller';
import { Site } from 'src/common/enums/site.enum';

@Controller('parser')
export class GamerController extends BaseController {
  private readonly logger = new Logger(GamerController.name);

  constructor(
    private readonly gamerService: GamerService,
    private readonly animeService: AnimeService,
  ) {
    super();
  }

  @Get('proxy-test')
  async testProxy() {
    return await this.animeService.testProxy();
  }

  @Post('gamer')
  async create(@Body() dto: GamerParserDto) {
    // 處理 POST 請求的邏輯
    return this.animeService.getM3U8Dict(dto);
  }

  @Get('gamer/list')
  @Header('Content-Type', 'application/json')
  @Header('Content-Disposition', 'attachment; filename="gamer.json"')
  downloadGamerList(@Res({ passthrough: true }) res: Response, @Query('debug') debug?: string) {
    const filePath = this.getGamerJsonPath(Site.GAMER);

    try {
      if (!existsSync(filePath)) {
        throw new Error('無法生成 JSON 檔案');
      }

      const stats = fs.statSync(filePath);
      res.set({
        'Content-Length': stats.size,
      });

      const fileStream = createReadStream(filePath);
      return new StreamableFile(fileStream);
    } catch (error) {
      this.logger.error(`下載 JSON 檔案失敗: ${error.message}`);
      res.status(404).json({
        success: false,
        message: '檔案不存在或無法下載',
        error: error.message,
      });
    }
  }
}
