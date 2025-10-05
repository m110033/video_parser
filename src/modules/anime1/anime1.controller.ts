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
import { Anime1M3u8ParserDto } from './dto/anime1-m3u8-parser.dto';
import { M3u8CacheService } from 'src/common/services/m3u8-cache.service';
import { GetM3u8Ro } from '../gamer/dto/get-m3u8.ro';
import { ConfigService } from '@nestjs/config';

@Controller('anime1')
export class Anime1Controller extends BaseController {
  private readonly logger = new Logger(Anime1Controller.name);

  constructor(
    private readonly anime1Service: Anime1Service,
    private readonly cacheService: M3u8CacheService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  @Post('info')
  async getInfo(@Body() dto: Anime1M3u8ParserDto) {
    return await this.anime1Service.parseAnime1VideoPage(dto);
  }

  // 取得 Anime1 作品所有集數 (列表頁 + 分頁聚合)
  @Get('episodes')
  async getEpisodes(@Query('url') url: string, @Res() res: Response) {
    if (!url) {
      return res.status(400).json({ success: false, message: '缺少 url 參數' });
    }
    try {
      const baseServiceUrl = this.configService
        .get<string>('SERVICE_BASE_URL')?.replace(/\/$/, '') || '';
      const page = await this.anime1Service.parseAnime1VideoPage({ url });
      const episodes = page.videoList.map(ep => ({
        title: ep.title,
        originalUrl: ep.videoUrl,
        videoUri: baseServiceUrl
          ? `${baseServiceUrl}/anime1/m3u8?url=${encodeURIComponent(ep.videoUrl)}`
          : '',
      }));
      return res.json({
        success: true,
        description: page.description,
        count: episodes.length,
        episodes,
      });
    } catch (error) {
      this.logger.error(`取得 Anime1 集數失敗: ${error.message}`);
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
      const videoId = url; // anime1 uses post URL as id
      this.cacheService.markViewed(clientIp, videoId);
      const cached = force !== 'true' ? this.cacheService.get(videoId) : undefined;
      if (cached) {
        return res.json(
          new GetM3u8Ro(true, '', cached.m3u8Url, cached.referer, cached.cookies, cached.origin),
        );
      }
      const data = await this.anime1Service.getM3U8Dict({ url });
      if (data?.m3u8Url) {
        this.cacheService.set({
          videoId,
          m3u8Url: data.m3u8Url,
          referer: data.referer,
          cookies: data.cookies,
          origin: data.origin || 'https://anime1.me',
          site: Site.ANIME1,
        });
      }
      return res.json(data);
    } catch (error) {
      this.logger.error(`取得 Anime1 m3u8 失敗: ${error.message}`);
      return res.status(500).json({ success: false, message: '解析失敗', error: error.message });
    }
  }

  @Post('parser')
  async create(@Body() dto: Anime1M3u8ParserDto) {
    return await this.anime1Service.getM3U8Dict(dto);
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
