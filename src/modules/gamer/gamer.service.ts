import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as cheerio from 'cheerio';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MovieClass } from 'src/common/movie.model';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GamerService {
  private readonly logger = new Logger(GamerService.name);
  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  // 從字串中擷取兩個字符間的內容
  private strBetween(str: string, start: string, end: string): string {
    const startIndex = str.indexOf(start);
    if (startIndex === -1) return '';

    const startPosWithOffset = startIndex + start.length;
    const endIndex = str.indexOf(end, startPosWithOffset);

    if (endIndex === -1) return '';

    return str.substring(startPosWithOffset, endIndex);
  }

  /**
   * 使用 HttpService 獲取頁面內容
   * @param url 請求的 URL
   * @param headers 請求頭
   * @returns 頁面 HTML 內容
   */
  private async fetchHtml(
    url: string,
    headers?: Record<string, string>,
  ): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { headers }),
      );
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
  async crawlGamer(debugMode: boolean = false): Promise<any> {
    try {
      this.logger.log('開始爬取動畫瘋動畫列表...');

      // 確定存儲目錄
      const curDirectory = debugMode ? 'debug' : 'store';
      const topDir = path.join(process.cwd(), curDirectory, 'gamer');

      // 創建目錄 (如果不存在)
      if (!fs.existsSync(topDir)) {
        fs.mkdirSync(topDir, { recursive: true });
      }

      // 使用 MovieClass 替代直接操作數組
      const movie_obj = new MovieClass();

      // 獲取總頁數
      const videoUrl = 'https://ani.gamer.com.tw/animeList.php?page=1&c=0';
      const html = await this.fetchHtml(videoUrl);

      const pageNumStr = this.strBetween(
        html,
        '<div class="page_number">',
        '/div>',
      ).trim();

      const pageNum = parseInt(
        this.strBetween(pageNumStr, "...<a href='?page=", '&').trim(),
      );

      // 限制最多爬取 15 頁
      const maxPages = parseInt(
        this.configService.get<string>('CRAWLER_MAX_PAGES') || '15',
      );
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
          const pageLink =
            'http://ani.gamer.com.tw/' + $el.attr('href')?.trim();
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
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
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
      const jsonFilePath = path.join(topDir, 'gamer.json');
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

  getGamerJsonPath(debugMode: boolean = false): string {
    const curDirectory = debugMode ? 'debug' : 'store';
    return path.join(process.cwd(), curDirectory, 'gamer', 'gamer.json');
  }
}
