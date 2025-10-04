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
import { M3u8CacheService } from 'src/common/services/m3u8-cache.service';
import { Request } from 'express';
import { GetM3u8Ro } from './dto/get-m3u8.ro';
import { ConfigService } from '@nestjs/config';

@Controller('gamer')
export class GamerController extends BaseController {
  private readonly logger = new Logger(GamerController.name);

  constructor(
    private readonly gamerService: GamerService,
    private readonly animeService: AnimeService,
    private readonly cacheService: M3u8CacheService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async testProxy() {
    return await this.animeService.testProxy();
  }

  // 取得某作品的所有集數 (含解析端點)
  @Get('episodes')
  async getEpisodes(@Query('url') url: string, @Res() res: Response) {
    if (!url) {
      return res.status(400).json({ success: false, message: '缺少 url 參數' });
    }
    try {
      const baseServiceUrl = this.configService
        .get<string>('SERVICE_BASE_URL')?.replace(/\/$/, '') || '';
      const page = await this.gamerService.parseGamerVideoPage({ url, sn: '' });
      const episodes = page.videoList.map(ep => ({
        title: ep.title,
        originalUrl: ep.videoUrl,
        videoUri: baseServiceUrl
          ? `${baseServiceUrl}/gamer/m3u8?url=${encodeURIComponent(ep.videoUrl)}`
          : '',
      }));
      return res.json({
        success: true,
        description: page.description,
        count: episodes.length,
        episodes,
      });
    } catch (error) {
      this.logger.error(`取得集數失敗: ${error.message}`);
      return res.status(500).json({ success: false, message: '解析失敗', error: error.message });
    }
  }

  @Get('m3u8')
  async getM3u8(@Query('url') url: string, @Res() res: Response, @Query('force') force?: string) {
    if (!url) {
      return res.status(400).json({ success: false, message: '缺少 url 參數' });
    }
    try {
      const headerIp = (res.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
      const clientIp = headerIp || res.req.socket.remoteAddress || 'unknown';
      // Derive videoId (use sn if present else url)
      const snMatch = url.match(/sn=(\d+)/);
      const videoId = snMatch && snMatch[1] ? snMatch[1] : url;
      this.cacheService.markViewed(clientIp, videoId);
      let cached = force !== 'true' ? this.cacheService.get(videoId) : undefined;
      if (cached) {
        return res.json(new GetM3u8Ro(true, snMatch ? snMatch[1] : '', cached.m3u8Url, cached.referer, cached.cookies));
      }
      // Trigger fetch
  const data = await this.animeService.getM3U8Dict({ url, sn: snMatch ? snMatch[1] : '' });
      if (data?.m3u8Url) {
        this.cacheService.set({
          videoId,
          m3u8Url: data.m3u8Url,
          referer: data.referer,
          cookies: data.cookies,
          site: Site.GAMER,
        });
      }
      return res.json(data);
    } catch (error) {
      this.logger.error(`取得 m3u8 失敗: ${error.message}`);
      return res.status(500).json({ success: false, message: '解析失敗', error: error.message });
    }
  }

  @Post('info')
  async getInfo(@Body() dto: GamerParserDto) {
    return await this.gamerService.parseGamerVideoPage(dto);
  }

  @Post('parser')
  async create(@Body() dto: GamerParserDto) {
    return await this.animeService.getM3U8Dict(dto);
  }

  @Get('list')
  @Header('Content-Type', 'application/json')
  @Header('Content-Disposition', 'attachment; filename="gamer.json"')
  downloadGamerList(@Res({ passthrough: true }) res: Response) {
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
