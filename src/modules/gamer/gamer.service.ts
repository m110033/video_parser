import { Injectable, Logger } from '@nestjs/common';
import { GamerParserDto } from './dto/gamer-parser.dto';
import { CrawlerService } from '../crawler/crawler.service';
import axios from 'axios';

@Injectable()
export class GamerService {
  private readonly logger = new Logger(GamerService.name);

  constructor(private readonly crawlerService: CrawlerService) {}

  // 從字串中擷取兩個字符間的內容
  private strBetween(str: string, start: string, end: string): string {
    const startIndex = str.indexOf(start);
    if (startIndex === -1) return '';

    const startPosWithOffset = startIndex + start.length;
    const endIndex = str.indexOf(end, startPosWithOffset);

    if (endIndex === -1) return '';

    return str.substring(startPosWithOffset, endIndex);
  }

  // 從廣告 JS 中獲取廣告 ID
  private async getAdId(): Promise<string> {
    try {
      // 加上時間戳參數避免快取
      const timestamp = Date.now();

      // 使用 crawlerService 替換 axios.get，添加 useProxy: true
      const page = await this.crawlerService.fetchUrl(
        `https://i2.bahamut.com.tw/JS/ad/animeVideo.js?v=${timestamp}`,
        { useProxy: true },
      );

      if (!page) {
        throw new Error('無法載入廣告 JS 頁面');
      }

      const adJsContent = await page.content();

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

  async parser(dto: GamerParserDto) {
    try {
      const { sn } = dto;
      let m3u8Url = null;
      let deviceId = '';

      // 初始化爬蟲服務
      await this.crawlerService.init();

      try {
        // 獲取 deviceid - 添加 useProxy: true
        this.logger.log('獲取 deviceId');
        const deviceIdPage = await this.crawlerService.fetchUrl(
          'https://ani.gamer.com.tw/ajax/getdeviceid.php?id=00862888f34dc1a8af5fe4fe17c3f07ea1e89872fd235e5467ef52c59343',
          { waitUntil: 'networkidle2', useProxy: true },
        );

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
          deviceId = deviceIdJson.deviceid;
          this.logger.log(`獲取到 deviceId: ${deviceId}`);
        } else {
          throw new Error('無法獲取 deviceId');
        }

        // 2. 從 JS 文件獲取廣告 ID
        const adId = await this.getAdId();
        this.logger.log(`使用廣告 ID: ${adId}`);

        // 獲取頁面 cookies
        const page = this.crawlerService.getPage();
        if (!page) {
          throw new Error('無法獲取頁面');
        }

        const cookies = await page.cookies();
        const cookieString = cookies
          .map((cookie) => `${cookie.name}=${cookie.value}`)
          .join('; ');

        // 設定共用的請求頭
        const headers = {
          referer: `https://ani.gamer.com.tw/animeVideo.php?sn=${sn}`,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Cookie: cookieString,
        };

        // 預先解鎖 - 添加 useProxy: true
        await this.unLockDeviceIdAndSn(deviceId, sn, headers, true);

        // 3. 發送 AD_ID 請求 - 添加 useProxy: true
        await this.crawlerService.fetchUrl(
          `https://ani.gamer.com.tw/ajax/videoCastcishu.php?s=${adId}&sn=${sn}`,
          { waitUntil: 'networkidle2', headers, useProxy: true },
        );
        this.logger.log('已發送 AD_ID 請求');

        // 4. 每隔 5 秒循環嘗試獲取 m3u8，總共 60 秒
        let retryCount = 0;
        const maxRetries = 12; // 60 秒 / 5 秒 = 12 次

        while (!m3u8Url && retryCount < maxRetries) {
          // 每次循環都發送廣告結束請求 - 添加 useProxy: true
          await this.crawlerService.fetchUrl(
            `https://ani.gamer.com.tw/ajax/videoCastcishu.php?s=${adId}&sn=${sn}&ad=end`,
            { waitUntil: 'networkidle2', headers, useProxy: true },
          );
          this.logger.log(`第 ${retryCount + 1} 次發送廣告結束請求`);

          // 嘗試獲取 m3u8 - 添加 useProxy: true
          try {
            const m3u8Page = await this.crawlerService.fetchUrl(
              `https://ani.gamer.com.tw/ajax/m3u8.php?sn=${sn}&device=${deviceId}`,
              { waitUntil: 'networkidle2', headers, useProxy: true },
            );

            if (!m3u8Page) {
              throw new Error('無法獲取 m3u8 頁面');
            }

            const m3u8Json = await m3u8Page.evaluate(() => {
              try {
                return JSON.parse(document.body.textContent?.trim() || '{}');
              } catch (e) {
                return null;
              }
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
            this.logger.debug(`重試中 ${retryCount + 1}/${maxRetries}...`);
          }

          this.logger.log(`等待 5 秒後重試，當前第 ${retryCount + 1} 次`);
          await new Promise((resolve) => setTimeout(resolve, 5000));
          retryCount++;
        }

        // 5. 無論是否獲取到 m3u8，都執行解鎖流程 - 添加 useProxy: true
        this.logger.log('執行解鎖流程');
        await this.unLockDeviceIdAndSn(deviceId, sn, headers, true);
      } finally {
        // 不需要關閉瀏覽器，CrawlerService 將負責管理
      }

      // 6. 如果未獲取到 m3u8，則返回錯誤
      if (!m3u8Url) {
        throw new Error('無法獲取 m3u8 網址，超過最大重試次數');
      }

      return {
        success: true,
        m3u8Url,
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

  // 修改 unLockDeviceIdAndSn 方法，添加 useProxy 參數
  async unLockDeviceIdAndSn(
    deviceId: string,
    sn: string,
    headers?: Record<string, string>,
    useProxy: boolean = true,
  ) {
    try {
      const requestHeaders = headers || {
        referer: `https://ani.gamer.com.tw/animeVideo.php?sn=${sn}`,
      };

      // 發送解鎖請求 - 添加 useProxy
      const unlockPage = await this.crawlerService.fetchUrl(
        `https://ani.gamer.com.tw/ajax/unlock.php?device=${deviceId}&sn=${sn}&ttl=0`,
        { headers: requestHeaders, useProxy: useProxy },
      );

      if (!unlockPage) {
        throw new Error('無法獲取解鎖頁面');
      }

      const unlockJson = await unlockPage.evaluate(() => {
        try {
          return JSON.parse(document.body.textContent?.trim() || '{}');
        } catch (e) {
          return null;
        }
      });

      this.logger.log(`解鎖請求回應: ${JSON.stringify(unlockJson)}`);

      // 檢查是否解鎖成功 - 添加 useProxy
      const checkLockPage = await this.crawlerService.fetchUrl(
        `https://ani.gamer.com.tw/ajax/checklock.php?device=${deviceId}&sn=${sn}`,
        { headers: requestHeaders, useProxy: useProxy },
      );

      if (!checkLockPage) {
        throw new Error('無法獲取檢查鎖定頁面');
      }

      const checkLockJson = await checkLockPage.evaluate(() => {
        try {
          return JSON.parse(document.body.textContent?.trim() || '{}');
        } catch (e) {
          return null;
        }
      });

      this.logger.log(`檢查鎖定狀態: ${JSON.stringify(checkLockJson)}`);
    } catch (error) {
      this.logger.error(`解鎖失敗: ${error.message}`, error.stack);
      throw error;
    }
  }
}
