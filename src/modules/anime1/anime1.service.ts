import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { Cron } from '@nestjs/schedule';
import { MovieClass } from 'src/common/movie.model';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Anime1ParserDto } from './dto/Anime1-parser.dto';
import { GetM3u8Ro } from '../gamer/dto/get-m3u8.ro';
import dayjs from 'dayjs';
import { Site } from 'src/common/enums/site.enum';
import { BaseService } from 'src/common/services/base.service';

@Injectable()
export class Anime1Service extends BaseService {
  private readonly logger = new Logger(Anime1Service.name);

  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    super();
  }

  private async fetchHtml(
    url: string,
    headers?: Record<string, string>,
  ): Promise<string> {
    try {
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch (error) {
      this.logger.error(`獲取頁面內容失敗 [${url}]: ${error.message}`);
      throw new Error(`獲取頁面內容失敗: ${error.message}`);
    }
  }

  getM3U8Dict(dto: Anime1ParserDto): GetM3u8Ro {
    let sn = '';
    let m3u8Url = '';
    let refererUrl = '';
    sn = 'test';
    m3u8Url = 'https://test.m3u8';
    refererUrl = 'https://test.referer';
    const ro = new GetM3u8Ro(true, sn, m3u8Url, refererUrl);
    return ro;
  }

  async crawler(): Promise<any> {
    try {
      this.logger.log('開始爬取 Anime1 動畫列表...');

      const topDir = path.join(process.cwd(), 'store', Site.ANIME1);

      if (!fs.existsSync(topDir)) {
        fs.mkdirSync(topDir, { recursive: true });
      }

      // 使用 MovieClass 替代直接操作數組
      const movie_obj = new MovieClass();

      // 收集所有動畫數據，以便後續排序
      const allAnimes: Array<{
        title: string;
        img: string;
        pageLink: string;
        dateStr: string;
        dateObj: Date;
      }> = [];

      const pageUrl = `https://d1zquzjgwo9yb.cloudfront.net/?_=${dayjs().unix()}`;
      const pageJson = await this.fetchHtml(pageUrl);

      // 解析頁面中的每個動畫項目
      for (const anime of pageJson) {
        const cat = anime.at(0) || 1;
        const title = anime.at(1) || '無標題';
        const year = anime.at(3) || 1991;
        const season = anime.at(4) || '春';
        let monthNum = 1;
        switch (season) {
          case '春':
            monthNum = 4;
            break; // Spring - April
          case '夏':
            monthNum = 7;
            break; // Summer - July
          case '秋':
            monthNum = 10;
            break; // Fall - October
          case '冬':
            monthNum = 1;
            break; // Winter - January
        }
        const dateStr = `${year}-${monthNum.toString().padStart(2, '0')}-01`;
        // 添加到臨時數組
        allAnimes.push({
          title,
          img: 'https://sta.anicdn.com/playerImg/8.jpg',
          pageLink: `https://anime1.me/?cat=${cat}`,
          dateStr,
          dateObj: new Date(dateStr),
        });
      }

      // 按日期排序所有動畫 (降序，最新日期在前)
      allAnimes.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

      // 將排序後的動畫依次添加到 movie_obj
      for (const anime of allAnimes) {
        movie_obj.addMovie(
          anime.title,
          anime.img,
          anime.pageLink,
          anime.dateStr,
        );
      }

      // 將結果保存為 JSON 檔案
      const jsonStr = movie_obj.dictToJson();
      const jsonFilePath = path.join(topDir, `${Site.ANIME1}.json`);
      fs.writeFileSync(jsonFilePath, jsonStr);

      const movieCount = movie_obj.getMovieCount();
      this.logger.log(
        `成功爬取 ${movieCount} 個動畫，結果已保存至 ${jsonFilePath}`,
      );

      return {
        success: true,
        count: movieCount,
        filePath: jsonFilePath,
        movies: movie_obj.getMovies(),
      };
    } catch (error) {
      this.logger.error(`爬取動畫瘋列表失敗: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message || '發生錯誤',
      };
    }
  }
}
