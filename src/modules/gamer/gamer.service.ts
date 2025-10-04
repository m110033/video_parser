import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as cheerio from 'cheerio';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MovieClass } from 'src/common/movie.model';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BaseService } from 'src/common/services/base.service';
import { GamerParserDto } from './dto/gamer-parser.dto';

export interface VideoList {
  title: string;
  videoUrl: string;
  siteName: string;
}

export interface VideoPageRo {
  description: string;
  videoList: Array<VideoList>;
}

@Injectable()
export class GamerService extends BaseService {
  private readonly logger = new Logger(GamerService.name);
  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    super();
  }

  /**
   * 使用 HttpService 獲取頁面內容
   * @param url 請求的 URL
   * @param headers 請求頭
   * @returns 頁面 HTML 內容
   */
  private async fetchHtml(url: string, headers?: Record<string, string>): Promise<string> {
    try {
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch (error) {
      this.logger.error(`獲取頁面內容失敗 [${url}]: ${error.message}`);
      throw new Error(`獲取頁面內容失敗: ${error.message}`);
    }
  }

  /**
   * 爬取動畫瘋的動畫列表並保存為 JSON 檔案
   * @param debugMode 是否為除錯模式
   * @returns 爬取到的動畫列表數據
   */
  @Cron(CronExpression.EVERY_HOUR)
  async crawlGamer(): Promise<any> {
    try {
      this.logger.log('開始爬取動畫瘋動畫列表...');

      const topDir = path.join(process.cwd(), 'store', 'gamer');

      if (!fs.existsSync(topDir)) {
        fs.mkdirSync(topDir, { recursive: true });
      }

      const baseServiceUrl =
        this.configService.get<string>('SERVICE_BASE_URL')?.replace(/\/$/, '') || '';

      // 獲取總頁數
      const videoUrl = 'https://ani.gamer.com.tw/animeList.php?page=1&c=0';
      const html = await this.fetchHtml(videoUrl);

      const pageNumStr = this.strBetween(html, '<div class="page_number">', '/div>').trim();

      const pageNum = parseInt(this.strBetween(pageNumStr, "...<a href='?page=", '&').trim());

      // 限制最多爬取 15 頁
      const maxPages = parseInt(this.configService.get<string>('CRAWLER_MAX_PAGES') || '15');
      const pagesToCrawl = Math.min(pageNum, maxPages);

      this.logger.log(`總共有 ${pageNum} 頁動畫，將爬取前 ${pagesToCrawl} 頁`);

      // 收集所有動畫數據，以便後續排序
      const allAnimes: Array<{
        title: string;
        img: string;
        pageLink: string;
        dateStr: string;
        dateObj: Date;
      }> = [];

      // 遍歷每一頁，但最多只爬取 maxPages 頁
      for (let pageIndex = 1; pageIndex <= pagesToCrawl; pageIndex++) {
        this.logger.debug(`正在解析第 ${pageIndex}/${pagesToCrawl} 頁`);

        const pageUrl = `https://ani.gamer.com.tw/animeList.php?page=${pageIndex}&c=0`;
        const pageHtml = await this.fetchHtml(pageUrl);

        const $ = cheerio.load(pageHtml.replace('</i>', ''));

        // 解析頁面中的每個動畫項目
        $('.theme-list-main').each((index, element) => {
          const $el = $(element);
          const pageLink = 'http://ani.gamer.com.tw/' + $el.attr('href')?.trim();
          const title = $el.find('.theme-name').text();

          // 提取圖片 URL
          const img = $el.find('.theme-img').attr('data-src') || '';

          // 提取年份信息
          const yearTxt = $el.find('.theme-time').text() + '共';
          const yearInfo = this.strBetween(yearTxt, '年份：', '共').trim();

          let dateStr = '1911-01-01';
          let dateObj = new Date('1911-01-01');
          try {
            // 將 YYYY/MM 轉換為 YYYY-MM-DD
            const parts = yearInfo.split('/');
            if (parts.length === 2) {
              const year = parseInt(parts[0]);
              const month = parseInt(parts[1]);
              dateStr = `${year}-${month.toString().padStart(2, '0')}-01`;
              dateObj = new Date(dateStr);
            }
          } catch (error) {
            this.logger.warn(`日期轉換錯誤: ${yearInfo}`);
          }

          // 添加到臨時數組
          allAnimes.push({
            title,
            img,
            pageLink,
            dateStr,
            dateObj,
          });
        });

        // 避免請求過於頻繁
        if (pageIndex < pagesToCrawl) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // 按日期排序所有動畫 (降序，最新日期在前)
      allAnimes.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

      // 轉換為 api.json style
      const content = allAnimes.map(anime => {
        const id = anime.pageLink;
        const videoEndpoint = baseServiceUrl
          ? `${baseServiceUrl}/gamer/m3u8?url=${encodeURIComponent(anime.pageLink)}`
          : '';
        return {
          id, // 使用頁面連結作為 id
          name: anime.title,
            description: '',
          uri: anime.pageLink,
          videoUri: videoEndpoint, // 播放器將呼叫此服務再解析真實 m3u8
          thumbnailUri: anime.img || '',
          backgroundUri: anime.img || '',
          category: `gamer - ${anime.title}`,
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

      const jsonFilePath = path.join(topDir, 'gamer.json');
      fs.writeFileSync(jsonFilePath, JSON.stringify(apiStyle, null, 2));

      this.logger.log(`成功爬取 ${content.length} 個動畫，結果已保存至 ${jsonFilePath}`);

      return {
        success: true,
        count: content.length,
        filePath: jsonFilePath,
      };
    } catch (error) {
      this.logger.error(`爬取動畫瘋列表失敗: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message || '發生錯誤',
      };
    }
  }

  getGamerJsonPath(debugMode: boolean = false): string {
    const curDirectory = debugMode ? 'debug' : 'store';
    return path.join(process.cwd(), curDirectory, 'gamer', 'gamer.json');
  }

  async parseGamerVideoPage(dto: GamerParserDto): Promise<VideoPageRo> {
    const { url } = dto;

    try {
      const html = await this.fetchHtml(url);

      // 使用 Cheerio 來解析 HTML
      const $ = cheerio.load(html);

      // 提取介紹信息
      const intro = $('div.data-context div.data-intro').text().trim();
      const cleanIntro = this.stripHtml(intro);

      // 提取視頻列表
      const videoMoviesList: Array<VideoList> = [];
      let hasMatch = false;

      // 使用 Cheerio 選擇器找出所有季節的視頻連結
      $('section.season > ul > li > a').each((_, element) => {
        hasMatch = true;

        // 取得視頻 URL 和標題
        const href = $(element).attr('href') || '';
        const videoTitle = $(element).text().trim();
        const videoUrl = `http://ani.gamer.com.tw/animeVideo.php${href}`;

        videoMoviesList.push({
          title: videoTitle,
          videoUrl: videoUrl,
          siteName: 'gamer',
        });
      });

      // 如果沒有找到其他視頻鏈接，就添加當前視頻
      if (!hasMatch) {
        videoMoviesList.push({
          title: '1',
          videoUrl: url,
          siteName: 'gamer',
        });
      }

      return {
        description: cleanIntro,
        videoList: videoMoviesList,
      };
    } catch (error) {
      this.logger.error(`解析動畫瘋視頻頁面失敗 [${url}]: ${error.message}`);
      return {
        description: '',
        videoList: [],
      };
    }
  }
}
