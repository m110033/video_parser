import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { Cron } from '@nestjs/schedule';
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
import { Anime1ParserDto } from './dto/anime1-parser.dto';

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

  async getM3U8Dict(dto: Anime1ParserDto): Promise<GetM3u8Ro> {
    const { url } = dto;

    try {
      this.logger.log(`開始獲取 Anime1 M3U8 資訊: ${url}`);

      // 從URL中提取SN (文章ID)
      const urlMatch = url.match(/anime1\.me\/(\d+)/);
      let sn = '';

      if (urlMatch && urlMatch[1]) {
        sn = urlMatch[1];
      } else {
        throw new Error('無法從 URL 提取影片 ID');
      }

      // 處理 Anime1 的頁面內容
      const html = await this.fetchHtml(url);
      const $ = cheerio.load(html);

      // 獲取視頻相關數據
      // Anime1 一般將視頻嵌入在 iframe 或從 JavaScript 加載
      let m3u8Url = '';
      let iframeUrl = '';

      // 搜索影片框架
      const iframe = $('iframe').first();
      if (iframe.length > 0) {
        iframeUrl = iframe.attr('src') || '';

        // 從 iframe URL 獲取實際視頻鏈接
        if (iframeUrl) {
          const iframeHtml = await this.fetchHtml(iframeUrl);
          const iframeSource = iframeHtml.match(/source\s+src=['"]([^'"]+)['"]/i);

          if (iframeSource && iframeSource[1]) {
            m3u8Url = iframeSource[1];
          }
        }
      }

      // 嘗試從頁面腳本中提取視頻鏈接
      if (!m3u8Url) {
        const scripts = $('script')
          .map((_, el) => $(el).html())
          .get();
        for (const script of scripts) {
          // 尋找包含 m3u8 URL 的腳本
          const m3u8Match = script?.match(/source\s+src=['"]([^'"]+\.m3u8[^'"]*)['"]/i);
          if (m3u8Match && m3u8Match[1]) {
            m3u8Url = m3u8Match[1];
            break;
          }

          // 或者尋找包含 video.js 的配置
          const videoJsMatch = script?.match(/source:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i);
          if (videoJsMatch && videoJsMatch[1]) {
            m3u8Url = videoJsMatch[1];
            break;
          }
        }
      }

      // 如果頁面上沒有發現視頻鏈接，嘗試解析頁面上的 JavaScript 數據
      if (!m3u8Url) {
        const playerScript = $('script:contains("player")').html();
        if (playerScript) {
          const dataMatch = playerScript.match(/videosource\s*=\s*['"]([^'"]+)['"]/i);
          if (dataMatch && dataMatch[1]) {
            m3u8Url = dataMatch[1];
          }
        }
      }

      // 設置 referer URL (對於某些服務器來說這是必須的，用於防止直接訪問)
      const refererUrl = url;

      this.logger.log(`成功獲取 Anime1 視頻資訊: SN=${sn}, M3U8=${m3u8Url}`);
      return new GetM3u8Ro(true, sn, m3u8Url, refererUrl);
    } catch (error) {
      this.logger.error(`獲取 Anime1 M3U8 失敗: ${error.message}`);
      return new GetM3u8Ro(false, '', '', '');
    }
  }

  async parseAnime1VideoPage(dto: Anime1ParserDto): Promise<VideoPageRo> {
    const { url } = dto;

    try {
      this.logger.log(`開始解析 Anime1 視頻頁面: ${url}`);
      const videoMoviesList: Array<VideoList> = [];
      let hasMatch = false;
      let hasNextPage = false;
      let currentPage = 1;
      let baseUrl = url;
      const cleanIntro = '';

      // 處理分頁，確保我們從第一頁開始
      if (url.includes('/page/')) {
        baseUrl = url.split('/page/')[0];
      }

      // 持續處理所有頁面，直到沒有下一頁
      do {
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

      // 將排序後的動畫依次添加到 movie_obj
      for (const anime of allAnimes) {
        movie_obj.addMovie(anime.title, anime.img, anime.pageLink, anime.dateStr);
      }

      // 將結果保存為 JSON 檔案
      const jsonStr = movie_obj.dictToJson();
      const jsonFilePath = path.join(topDir, `${Site.ANIME1}.json`);
      fs.writeFileSync(jsonFilePath, jsonStr);

      const movieCount = movie_obj.getMovieCount();
      this.logger.log(`成功爬取 ${movieCount} 個動畫，結果已保存至 ${jsonFilePath}`);

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
