import { Injectable, Logger } from '@nestjs/common';
import { GamerParserDto } from './dto/gamer-parser.dto';
import { CrawlerService } from '../crawler/crawler.service';
import * as path from 'path';
import * as fs from 'fs';
import * as cheerio from 'cheerio';
import { Cron, CronExpression } from '@nestjs/schedule';
import dayjs from 'dayjs';
import { MovieClass } from 'src/common/movie.model';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CrawlerCaptchaSolverService } from '../crawler/crawler-captcha-solver.service';
import { Page } from 'puppeteer';

@Injectable()
export class GamerService {
  private readonly logger = new Logger(GamerService.name);

  private readonly loginUrl =
    'https://api.gamer.com.tw/mobile_app/user/v3/do_login.php';

  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

  constructor(
    private readonly crawlerService: CrawlerService,
    private readonly configService: ConfigService,
    private readonly crawlerCaptchaSolverService: CrawlerCaptchaSolverService,
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

  // 從廣告 JS 中獲取廣告 ID，支持 puppeteer 或 axios
  private async getAdId(usePuppeteer: boolean = true): Promise<string> {
    try {
      // 加上時間戳參數避免快取
      const timestamp = Date.now();
      const adJsUrl = `https://i2.bahamut.com.tw/JS/ad/animeVideo.js?v=${timestamp}`;

      let adJsContent = '';

      if (usePuppeteer) {
        const page = await this.crawlerService.request<Page>({
          url: adJsUrl,
          usePuppeteer: true,
        });

        if (page) {
          adJsContent = await page.content();
        }
      } else {
        adJsContent = (await this.crawlerService.request<string>({
          url: adJsUrl,
          usePuppeteer: false,
        })) as string;
      }

      if (!adJsContent) {
        throw new Error('無法載入廣告 JS 內容');
      }

      // 使用 strBetween 方法從 id= 提取廣告 ID
      const adId = this.strBetween(adJsContent, 'id=', '"');

      if (adId) {
        this.logger.log(`從 animeVideo.js 獲取到廣告 ID: ${adId}`);
        return adId;
      }

      // 如果無法從 JS 中找到廣告 ID，嘗試備用方法
      if (adJsContent.includes('var getMajorAd')) {
        // 找出廣告列表
        const adListMatch = adJsContent.match(/var adlist = \[(.*?)\];/s);

        if (adListMatch && adListMatch[1]) {
          // 從廣告列表中提取第一個廣告的 ID
          const firstAdMatch = adListMatch[1].match(/\["(\d+)"/);

          if (firstAdMatch && firstAdMatch[1]) {
            const backupAdId = firstAdMatch[1];
            this.logger.log(
              `從 animeVideo.js 廣告列表獲取到廣告 ID: ${backupAdId}`,
            );
            return backupAdId;
          }
        }
      }

      // 如果都無法獲取，使用預設值
      this.logger.warn('無法從 animeVideo.js 找到廣告 ID，使用預設值');
      return '115237';
    } catch (error) {
      this.logger.error('獲取廣告 ID 時發生錯誤', error);
      return '115237'; // 預設廣告 ID
    }
  }

  private async getSNFromUrl(
    url: string,
    usePuppeteer: boolean = true,
  ): Promise<string> {
    try {
      let SN = '';
      this.logger.log(`正在從 URL 解析 SN: ${url}`);

      // 按照原邏輯判斷 URL 是否包含 "animeVideo"
      if (url.indexOf('animeVideo') < 0) {
        if (usePuppeteer) {
          // 使用 Puppeteer 方式獲取參考頁面內容
          const refPage = await this.crawlerService.fetchUrl(url, {
            waitUntil: 'domcontentloaded',
          });

          if (!refPage) {
            throw new Error('無法獲取參考頁面');
          }

          // 從參考頁面 HTML 中提取 SN
          SN = await refPage.evaluate(() => {
            // 首先嘗試獲取 og:url meta 標籤
            const metaOgUrl = document.querySelector('meta[property="og:url"]');
            if (metaOgUrl) {
              const ogUrl = metaOgUrl.getAttribute('content') || '';
              // 從 og:url 中提取 SN
              const match = ogUrl.match(/animeVideo\.php\?sn=(\d+)/);
              if (match && match[1]) {
                return match[1];
              }
            }

            // 備用方法：尋找頁面上的 animeVideo.php?sn= 鏈接
            const videoLinks = document.querySelectorAll(
              'a[href*="animeVideo.php?sn="]',
            );
            if (videoLinks && videoLinks.length > 0) {
              const href = videoLinks[0].getAttribute('href') || '';
              const linkMatch = href.match(/sn=(\d+)/);
              if (linkMatch && linkMatch[1]) {
                return linkMatch[1];
              }
            }

            return '';
          });
        } else {
          // 使用 axios 方式獲取參考頁面內容
          const response = await axios.get(url, {
            headers: {
              'User-Agent': this.userAgent,
            },
          });

          const html = response.data;

          // 使用 cheerio 解析 HTML
          const $ = cheerio.load(html);

          // 嘗試從 meta og:url 獲取 SN
          const ogUrl = $('meta[property="og:url"]').attr('content') || '';
          const ogMatch = ogUrl.match(/animeVideo\.php\?sn=(\d+)/);

          if (ogMatch && ogMatch[1]) {
            SN = ogMatch[1];
          } else {
            // 嘗試從鏈接中獲取 SN
            const videoLink =
              $('a[href*="animeVideo.php?sn="]').first().attr('href') || '';
            const linkMatch = videoLink.match(/sn=(\d+)/);

            if (linkMatch && linkMatch[1]) {
              SN = linkMatch[1];
            }
          }
        }

        this.logger.log(`從參考頁面獲取 SN: ${SN}`);
      } else {
        // 直接從 URL 提取 SN
        const snMatch = url.match(/sn=(\d+)/);
        if (snMatch && snMatch[1]) {
          SN = snMatch[1];
        } else {
          SN = this.strBetween(url, 'sn=', '"');
        }
        this.logger.log(`直接從 URL 獲取 SN: ${SN}`);
      }

      if (!SN) {
        throw new Error('無法解析 SN');
      }

      return SN;
    } catch (error) {
      this.logger.error(`獲取 SN 失敗: ${error.message}`);
      throw error;
    }
  }

  async login(username: string, password: string) {
    try {
      const task = await this.crawlerCaptchaSolverService.createTaskByCapSolver(
        {
          type: 'ReCaptchaV2TaskProxyLess',
          websiteURL: 'https://user.gamer.com.tw/login.php',
          websiteKey: '6Lcu1KAaAAAAABVXy4pHWruzjVBg5WxPq6EhLKkY',
          isInvisible: false,
        },
      );

      const result =
        await this.crawlerCaptchaSolverService.getTaskResultByCapSolver(
          task.taskId,
        );

      // 獲取 reCAPTCHA 令牌
      const gRecaptchaResponse = result.solution.gRecaptchaResponse;

      if (!gRecaptchaResponse) {
        throw new Error('無法獲取 reCAPTCHA 令牌');
      }

      this.logger.log('成功獲取 reCAPTCHA 令牌');

      // 使用 FormData 格式發送登入請求
      const formData = new FormData();
      formData.append('userid', username);
      formData.append('password', password);
      formData.append('autoLogin', 'T');
      formData.append('g-recaptcha-response', gRecaptchaResponse);

      const response = await axios.post(
        'https://user.gamer.com.tw/ajax/do_login.php',
        formData,
        {
          headers: {
            'User-Agent': this.userAgent,
            'Content-Type': 'multipart/form-data',
          },
        },
      );

      const cookies = response.headers['set-cookie'];
      if (!cookies) {
        throw new Error('無法獲取 Cookies');
      }
      const bunchOfCookies = cookies.map((cookie) => {
        const [name, value] = cookie.split(';')[0].split('=');
        return { name, value };
      });
      return bunchOfCookies;
    } catch (error) {
      throw new Error(`登入失敗：${error.message}`);
    }
  }

  /**
   * 獲取裝置 ID，支援使用 Puppeteer 或 Axios 兩種方式
   * @param usePuppeteer 是否使用 Puppeteer (預設為 true)
   * @param headers 請求頭
   * @returns 裝置 ID
   */
  async getDeviceId(
    usePuppeteer: boolean = true,
    headers?: Record<string, string>,
  ): Promise<string> {
    try {
      const url =
        'https://ani.gamer.com.tw/ajax/getdeviceid.php?id=00862888f34dc1a8af5fe4fe17c3f07ea1e89872fd235e5467ef52c59343';
      this.logger.log(
        `使用${usePuppeteer ? 'Puppeteer' : 'Axios'}方式獲取 deviceId`,
      );

      if (usePuppeteer) {
        // 使用 Puppeteer 方式
        const deviceIdPage = await this.crawlerService.fetchUrl(url, {
          waitUntil: 'networkidle2',
          useProxy: process.env.IS_PROXY_ENABLED === 'true',
          headers: headers,
        });

        if (!deviceIdPage) {
          throw new Error('無法獲取 deviceId 頁面');
        }

        const deviceIdJson = await deviceIdPage.evaluate(() => {
          try {
            return JSON.parse(document.body.textContent?.trim() || '{}');
          } catch (e) {
            return null;
          }
        });

        if (deviceIdJson && deviceIdJson.deviceid) {
          const deviceId = deviceIdJson.deviceid;
          this.logger.log(`獲取到 deviceId: ${deviceId}`);
          return deviceId;
        } else {
          throw new Error('無法從 Puppeteer 回應解析 deviceId');
        }
      } else {
        // 使用 Axios 方式
        const response = await axios.get(url, {
          headers: {
            'User-Agent': this.userAgent,
            ...(headers || {}),
          },
          proxy:
            process.env.IS_PROXY_ENABLED === 'true'
              ? {
                  host: process.env.PROXY_HOST || '',
                  port: parseInt(process.env.PROXY_PORT || '0'),
                  auth: process.env.PROXY_AUTH
                    ? {
                        username: process.env.PROXY_USERNAME || '',
                        password: process.env.PROXY_PASSWORD || '',
                      }
                    : undefined,
                }
              : undefined,
        });

        if (response.data && response.data.deviceid) {
          const deviceId = response.data.deviceid;
          this.logger.log(`獲取到 deviceId: ${deviceId}`);
          return deviceId;
        } else {
          throw new Error('無法從 Axios 回應解析 deviceId');
        }
      }
    } catch (error) {
      this.logger.error(`獲取 deviceId 失敗: ${error.message}`, error.stack);
      throw new Error(`獲取 deviceId 失敗: ${error.message}`);
    }
  }

  async parser(dto: GamerParserDto) {
    try {
      const { url, usePuppeteer = true } = dto; // 添加參數允許選擇技術
      let m3u8Url = null;
      let deviceId = '';
      let bunchCookies: Array<{ name: string; value: string }> = [];

      // 初始化爬蟲服務 (僅在使用 puppeteer 時需要)
      if (usePuppeteer) {
        await this.crawlerService.init();
      }

      // 1. 先登入獲取 BAHARUNE cookie
      try {
        this.logger.log('嘗試登入獲取 BAHARUNE...');
        // 使用傳入的帳密或默認帳密
        const loginUsername = process.env.GAMER_USER || '';
        const loginPassword = process.env.GAMER_PASWWORD || '';

        bunchCookies = await this.login(loginUsername, loginPassword);
        this.logger.log('登入成功，已獲取 bunchCookies');
      } catch (loginError) {
        this.logger.warn(`登入失敗: ${loginError.message}，將以匿名模式繼續`);
      }

      // 2. 從 URL 獲取 SN
      this.logger.log(`解析 URL: ${url}`);
      const sn = await this.getSNFromUrl(url, usePuppeteer);

      if (!sn) {
        throw new Error('無法從 URL 獲取 SN');
      }

      this.logger.log(`成功獲取 SN: ${sn}`);

      // 3. 構建標準視頻頁面 URL 作為 referer
      const refererUrl = `https://ani.gamer.com.tw/animeVideo.php?sn=${sn}`;
      this.logger.log(`使用參考頁面: ${refererUrl}`);

      const headers = {
        referer: refererUrl,
        'User-Agent': this.userAgent,
        Cookie: bunchCookies
          .map((cookie) => `${cookie.name}=${cookie.value}`)
          .join('; '),
      };

      this.logger.log(`請求頭: ${JSON.stringify(headers)}`);

      this.logger.log('獲取 deviceId');

      deviceId = await this.getDeviceId(usePuppeteer, headers);

      const adId = await this.getAdId(usePuppeteer);
      this.logger.log(`使用廣告 ID: ${adId}`);

      await this.crawlerService.request({
        url: `https://ani.gamer.com.tw/ajax/videoCastcishu.php?s=${adId}&sn=${sn}`,
        headers,
        usePuppeteer,
      });
      this.logger.log('已發送 AD_ID 請求');

      // 8. 每隔 5 秒循環嘗試獲取 m3u8，總共 60 秒
      let retryCount = 0;
      const maxRetries = 10; // 60 秒 / 5 秒 = 10 次

      while (!m3u8Url && retryCount < maxRetries) {
        // 每次循環都發送廣告結束請求
        await this.crawlerService.request({
          url: `https://ani.gamer.com.tw/ajax/videoCastcishu.php?s=${adId}&sn=${sn}&ad=end`,
          headers,
          usePuppeteer,
        });
        this.logger.log(`第 ${retryCount + 1} 次發送廣告結束請求`);

        // 嘗試獲取 m3u8
        try {
          const m3u8Json = await this.crawlerService.request({
            url: `https://ani.gamer.com.tw/ajax/m3u8.php?sn=${sn}&device=${deviceId}`,
            headers,
            usePuppeteer,
          });

          this.logger.log(
            `第 ${retryCount + 1} 次獲取 m3u8 回應: ${JSON.stringify(m3u8Json)}`,
          );

          if (m3u8Json && m3u8Json.src) {
            m3u8Url = m3u8Json.src;
            this.logger.log('成功獲取 m3u8 網址');
            break;
          } else {
            this.logger.debug(`m3u8 未就緒`);
          }
        } catch (error) {
          this.logger.error(`獲取 m3u8 失敗: ${error.response?.data?.error}`);
          const code = error.response?.data?.error?.code;
          if (code === 1007) {
            await this.unLockDeviceIdAndSn(
              deviceId,
              sn,
              headers,
              true,
              usePuppeteer,
            );
            deviceId = await this.getDeviceId(usePuppeteer, headers);
          }
          this.logger.debug(`重試中 ${retryCount + 1}/${maxRetries}...`);
        }

        this.logger.log(`等待 5 秒後重試，當前第 ${retryCount + 1} 次`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        retryCount++;
      }

      // 9. 無論是否獲取到 m3u8，都執行解鎖流程
      this.logger.log('執行解鎖流程');
      await this.unLockDeviceIdAndSn(deviceId, sn, headers, true, usePuppeteer);

      // 10. 如果未獲取到 m3u8，則返回錯誤
      if (!m3u8Url) {
        throw new Error('無法獲取 m3u8 網址，超過最大重試次數');
      }

      const qualities = await this.parseM3u8Qualities(m3u8Url, headers);

      return {
        success: true,
        sn,
        m3u8Url,
        referer: refererUrl, // 返回參考頁面 URL
        qualities, // 返回按品質排序的視訊串流
      };
    } catch (error) {
      this.logger.error(`解析失敗: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message || '發生錯誤',
        details: error.response?.data || {},
      };
    }
  }

  /**
   * 解析 m3u8 檔案並獲取不同品質的視訊串流
   * @param m3u8Url m3u8 檔案的 URL
   * @param headers 請求頭
   * @returns 按品質排序的視訊串流列表
   */
  private async parseM3u8Qualities(
    m3u8Url: string,
    headers?: Record<string, string>,
  ) {
    try {
      this.logger.log(`解析 m3u8 品質: ${m3u8Url}`);

      // 使用 axios 獲取 m3u8 內容
      const response = await axios.get(m3u8Url, {
        headers: {
          Origin: headers?.origin || 'https://ani.gamer.com.tw',
          // Referer: headers?.referer || 'https://ani.gamer.com.tw',
        },
      });

      const m3u8Content = response.data;
      this.logger.debug(`m3u8 內容: ${m3u8Content}`);

      // 解析 m3u8 內容以獲取不同品質的串流
      const lines = m3u8Content.split('\n');
      const qualities: Array<{
        resolution: string;
        bandwidth: number;
        url: string;
      }> = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('#EXT-X-STREAM-INF:')) {
          // 解析品質信息行
          const infoLine = lines[i];
          const bandwidth = parseInt(
            this.strBetween(infoLine, 'BANDWIDTH=', ',') ||
              this.strBetween(infoLine, 'BANDWIDTH=', '\r') ||
              '0',
          );
          const resolution =
            this.strBetween(infoLine, 'RESOLUTION=', '\r') ||
            this.strBetween(infoLine, 'RESOLUTION=', ',') ||
            'unknown';

          // 獲取下一行的 URL
          const urlLine = lines[i + 1];
          if (urlLine && !urlLine.startsWith('#')) {
            // 構建完整的 URL（如果需要的話）
            const url = urlLine.startsWith('http')
              ? urlLine
              : new URL(urlLine, m3u8Url).toString();

            // 添加到品質列表
            qualities.push({
              resolution,
              bandwidth,
              url,
            });

            i++; // 跳過 URL 行
          }
        }
      }

      // 如果沒有找到多個品質，可能是單一清單
      if (qualities.length === 0 && m3u8Content.includes('#EXTINF:')) {
        qualities.push({
          resolution: 'default',
          bandwidth: 0,
          url: m3u8Url,
        });
      }

      // 按照頻寬降序排序（最高品質在前）
      qualities.sort((a, b) => b.bandwidth - a.bandwidth);

      // 獲取最高和最低品質
      const highest = qualities.length > 0 ? qualities[0] : null;
      const lowest =
        qualities.length > 0 ? qualities[qualities.length - 1] : null;

      this.logger.log(`找到 ${qualities.length} 種不同品質的視訊串流`);

      return {
        sorted: qualities,
        highest: highest || {
          resolution: 'unknown',
          bandwidth: 0,
          url: m3u8Url,
        },
        lowest: lowest || { resolution: 'unknown', bandwidth: 0, url: m3u8Url },
      };
    } catch (error) {
      this.logger.error(`解析 m3u8 品質失敗: ${error.message}`, error.stack);

      // 如果解析失敗，返回原始 URL 作為唯一品質
      return {
        sorted: [
          {
            resolution: 'unknown',
            bandwidth: 0,
            url: m3u8Url,
          },
        ],
        highest: {
          resolution: 'unknown',
          bandwidth: 0,
          url: m3u8Url,
        },
        lowest: {
          resolution: 'unknown',
          bandwidth: 0,
          url: m3u8Url,
        },
      };
    }
  }

  // 解鎖設備和視頻，支持 puppeteer 或 axios
  async unLockDeviceIdAndSn(
    deviceId: string,
    sn: string,
    headers?: Record<string, string>,
    useProxy: boolean = true,
    usePuppeteer: boolean = true,
  ) {
    try {
      const requestHeaders = headers || {
        referer: `https://ani.gamer.com.tw/animeVideo.php?sn=${sn}`,
      };

      // 發送解鎖請求
      const unlockJson = await this.crawlerService.request<any>({
        url: `https://ani.gamer.com.tw/ajax/unlock.php?device=${deviceId}&sn=${sn}&ttl=0`,
        headers: requestHeaders,
        useProxy,
        usePuppeteer,
      });

      this.logger.log(`解鎖請求回應: ${JSON.stringify(unlockJson)}`);

      // 檢查是否解鎖成功
      const checkLockJson = await this.crawlerService.request<any>({
        url: `https://ani.gamer.com.tw/ajax/checklock.php?device=${deviceId}&sn=${sn}`,
        headers: requestHeaders,
        useProxy,
        usePuppeteer,
      });

      this.logger.log(`檢查鎖定狀態: ${JSON.stringify(checkLockJson)}`);
    } catch (error) {
      this.logger.error(`解鎖失敗: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 爬取動畫瘋的動畫列表並保存為 JSON 檔案
   * @param debugMode 是否為除錯模式
   * @returns 爬取到的動畫列表數據
   */
  // @Cron(CronExpression.EVERY_HOUR)
  async crawlGamer(debugMode: boolean = false): Promise<any> {
    try {
      this.logger.log('開始爬取動畫瘋動畫列表...');

      // 初始化爬蟲服務
      await this.crawlerService.init();

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
      const page = await this.crawlerService.fetchUrl(videoUrl);

      if (!page) {
        throw new Error('無法獲取動畫瘋首頁');
      }

      const html = await page.content();
      const pageNumStr = this.strBetween(
        html,
        '<div class="page_number">',
        '/div>',
      ).trim();
      const pageNum = parseInt(
        this.strBetween(pageNumStr, '...<a href="?page=', '&').trim(),
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
        const pageResponse = await this.crawlerService.fetchUrl(pageUrl);

        if (!pageResponse) {
          this.logger.error(`無法獲取第 ${pageIndex} 頁`);
          continue;
        }

        const pageHtml = await pageResponse.content();
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

  // @Cron(dayjs().add(10, 's').toDate())
  async startupCrawlGamer() {
    return await this.crawlGamer(false);
  }

  getGamerJsonPath(debugMode: boolean = false): string {
    const curDirectory = debugMode ? 'debug' : 'store';
    return path.join(process.cwd(), curDirectory, 'gamer', 'gamer.json');
  }
}
