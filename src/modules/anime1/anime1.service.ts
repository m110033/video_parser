import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { MovieClass } from 'src/common/movie.model';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { GetM3u8Ro } from '../gamer/dto/get-m3u8.ro';
import dayjs from 'dayjs';
import { Site } from 'src/common/enums/site.enum';
import { BaseService } from 'src/common/services/base.service';
import * as cheerio from 'cheerio';
import { VideoList, VideoPageRo } from '../gamer/gamer.service';
import { Anime1M3u8ParserDto } from './dto/anime1-m3u8-parser.dto';

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

  private async fetchHtml(url: string, headers?: Record<string, string>): Promise<string> {
    try {
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch (error) {
      this.logger.error(`獲取頁面內容失敗 [${url}]: ${error.message}`);
      throw new Error(`獲取頁面內容失敗: ${error.message}`);
    }
  }

  async getM3U8Dict(dto: Anime1M3u8ParserDto): Promise<GetM3u8Ro> {
    const { url } = dto;

    try {
      this.logger.log(`開始獲取 Anime1 M3U8 資訊: ${url}`);

      // 載入 HTML
      const html = await this.fetchHtml(url);
      const $ = cheerio.load(html);

      // 取得 data-apireq
      const dataApiReq = $('.entry-content .vjscontainer .video-js').attr('data-apireq');
      if (!dataApiReq) throw new Error('無法取得 data-apireq 參數');

      // 建立 POST 請求資料
      const jsonStr = decodeURIComponent(dataApiReq);

      // 發送 POST 請求到 API 取得 mp4 連結
      const response = await firstValueFrom(
        this.httpService.post(
          'https://v.anime1.me/api',
          new URLSearchParams({
            d: jsonStr,
          }),
          {
            headers: {
              'User-Agent': this.userAgent,
              'Content-Type': 'application/x-www-form-urlencoded',
              Host: 'v.anime1.me',
            },
          },
        ),
      );

      const videoList = response.data?.s;
      if (!videoList || videoList.length === 0 || !videoList[0].src) {
        throw new Error('API 未返回有效的影片連結');
      }

      const cookies = response.headers['set-cookie'];
      if (!cookies) {
        throw new Error('無法獲取 Cookies');
      }

      const cookieString =
        cookies
          .map(cookie => {
            const [name, value] = cookie.split(';')[0].split('=');
            return `${name}=${value}`;
          })
          .join('; ') + ';';

      // 處理並補上協定（部分情況返回 //xxx.mp4）
      let m3u8Url = videoList[0].src;
      if (m3u8Url.startsWith('//')) {
        m3u8Url = 'https:' + m3u8Url;
      }

      this.logger.log(`成功取得影片連結: ${m3u8Url}`);
      const origin = 'https://anime1.me';
      return new GetM3u8Ro(true, '', m3u8Url, url, cookieString, origin);
    } catch (error) {
      this.logger.error(`Anime1 M3U8 獲取失敗: ${error.message}`);
      return new GetM3u8Ro(false, '', '', '', '', 'https://anime1.me');
    }
  }

  async parseAnime1VideoPage(dto: Anime1M3u8ParserDto): Promise<VideoPageRo> {
    const { url } = dto;

    try {
      this.logger.log(`開始解析 Anime1 視頻頁面: ${url}`);
      const videoMoviesList: Array<VideoList> = [];
      let hasMatch = false;
      let hasNextPage = false;
      let currentPage = 1;
      let baseUrl = url;
      const cleanIntro = '';

      do {
        if (baseUrl.includes('/page/')) {
          baseUrl = baseUrl.split('/page/')[0];
        }

        const pageUrl = currentPage === 1 ? baseUrl : `${baseUrl}/page/${currentPage}`;
        this.logger.debug(`正在處理頁面: ${pageUrl}`);

        const html = await this.fetchHtml(pageUrl);
        const $ = cheerio.load(html);

        $('article.post').each((_, article) => {
          const $article = $(article);

          const titleElement = $article.find('.entry-title a');
          const title = titleElement.text().trim();
          const videoUrl = titleElement.attr('href') || '';

          if (videoUrl) {
            hasMatch = true;

            videoMoviesList.push({
              title: title,
              videoUrl: videoUrl,
              siteName: 'anime1',
            });
          }
        });

        hasNextPage = $('.nav-links .nav-previous a').length > 0;

        if (hasNextPage) {
          baseUrl = $('.nav-links .nav-previous a').attr('href') || baseUrl;
          currentPage++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } while (hasNextPage);

      if (!hasMatch) {
        videoMoviesList.push({
          title: '1',
          videoUrl: url,
          siteName: 'anime1',
        });
      }

      this.logger.log(`已解析 ${videoMoviesList.length} 個視頻連結`);

      // 影片按集數排序（假設標題是數字）
      videoMoviesList.sort((a, b) => {
        const numA = parseInt(a.title) || 0;
        const numB = parseInt(b.title) || 0;
        return numA - numB;
      });

      return {
        description: cleanIntro,
        videoList: videoMoviesList,
      };
    } catch (error) {
      this.logger.error(`解析 Anime1 視頻頁面失敗 [${url}]: ${error.message}`);
      return {
        description: '',
        videoList: [],
      };
    }
  }

  async crawler(): Promise<any> {
    try {
      this.logger.log('開始爬取 Anime1 動畫列表...');

      const topDir = path.join(process.cwd(), 'store', Site.ANIME1);

      if (!fs.existsSync(topDir)) {
        fs.mkdirSync(topDir, { recursive: true });
      }

      const baseServiceUrl =
        this.configService.get<string>('SERVICE_BASE_URL')?.replace(/\/$/, '') || '';

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
        const yearValue = anime.at(3) || '1991';
        let year: number;
        if (typeof yearValue === 'string' && yearValue.includes('/')) {
          year = parseInt(yearValue.split('/')[0], 10);
        } else {
          year = parseInt(String(yearValue), 10);
        }
        if (isNaN(year)) {
          year = 1991; // 默認年份
        }
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

      const content = allAnimes.map(anime => {
        const id = anime.pageLink;
        const episodeUrl = baseServiceUrl
          ? `${baseServiceUrl}/anime1/episodes?url=${encodeURIComponent(anime.pageLink)}`
          : '';
        return {
          id,
          name: anime.title,
          description: '',
          uri: anime.pageLink,
          videoUri: '', // 不直接提供 m3u8 解析端點
          episodeUrl,
          thumbnailUri: anime.img || '',
          backgroundUri: anime.img || '',
          category: `anime1 - ${anime.title}`,
          duration: '',
          seriesUri: anime.pageLink,
          episodeNumber: '',
          videoType: 'episode',
          seasonNumber: '',
          seasonUri: '',
        };
      });

      const apiStyle = {
        content,
        metadata: { last_updated: new Date().toISOString() },
      };

      const jsonFilePath = path.join(topDir, `${Site.ANIME1}.json`);
      fs.writeFileSync(jsonFilePath, JSON.stringify(apiStyle, null, 2));

      this.logger.log(`成功爬取 ${content.length} 個動畫，結果已保存至 ${jsonFilePath}`);

      return {
        success: true,
        count: content.length,
        filePath: jsonFilePath,
      };
    } catch (error) {
      this.logger.error(`爬取 Anime1 列表失敗: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message || '發生錯誤',
      };
    }
  }
}
