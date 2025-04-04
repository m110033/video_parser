import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
  Browser,
  HTTPResponse,
  Page,
  PuppeteerLifeCycleEvent,
} from 'puppeteer';
import { lastValueFrom } from 'rxjs';
import * as chromium from 'chromium';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  private browser?: Browser;

  private page?: Page;

  private pageResponse?: HTTPResponse | null;

  private proxyServer?: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // 從環境變數獲取代理配置
    this.proxyServer = this.configService.get<string>('PROXY_SERVER');

    // 如果有代理設置，記錄日誌
    if (this.proxyServer) {
      this.logger.log(`Proxy server configured: ${this.proxyServer}`);
    }
  }

  async init() {
    return await this.resetBrowser();
  }

  // 檢查當前是否啟用了代理
  private isProxyEnabled(): boolean {
    return !!this.proxyServer;
  }

  /**
   * 設置是否使用代理
   * @param enable 是否啟用代理
   * @param resetBrowser 是否立即重置瀏覽器以應用新設置
   */
  async setProxyEnabled(
    enable: boolean,
    resetBrowser: boolean = true,
  ): Promise<void> {
    const originalState = this.isProxyEnabled();

    if (originalState === enable) {
      this.logger.log(`Proxy already ${enable ? 'enabled' : 'disabled'}`);
      return;
    }

    const tempProxyServer = this.proxyServer;
    if (!enable) {
      this.proxyServer = undefined;
    } else if (!this.proxyServer && tempProxyServer) {
      this.proxyServer = tempProxyServer;
    } else if (!this.proxyServer) {
      this.proxyServer = this.configService.get<string>('PROXY_SERVER');
    }

    this.logger.log(`Proxy ${enable ? 'enabled' : 'disabled'}`);

    if (resetBrowser) {
      await this.resetBrowser();
    }
  }

  async resetBrowser() {
    // 關閉瀏覽器
    try {
      await this.browser?.close();
    } catch (err) {
      this.logger.error(`close browser error: ${err.message}`);
    }

    try {
      // 基本啟動參數
      const launchArgs = [
        '--disable-gpu',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--no-zygote',
        '--disable-dev-shm-usage',
      ];

      // 如果有設置代理，添加代理參數
      if (this.proxyServer) {
        launchArgs.push(`--proxy-server=${this.proxyServer}`);
        this.logger.log(`Using proxy: ${this.proxyServer}`);
      }

      this.browser = await puppeteer.use(StealthPlugin()).launch({
        args: launchArgs,
        headless: true,
        acceptInsecureCerts: true,
        executablePath: chromium.path,
      });

      this.logger.log('browser launched.');
    } catch (err) {
      this.logger.error(`reset browser error: ${err.message}`);
      throw err; // 拋出錯誤，讓上層處理
    }

    return await this.resetPages();
  }

  // 添加代理身份驗證方法
  async authenticateProxyIfNeeded(page: Page) {
    const proxyUsername = this.configService.get<string>('PROXY_USERNAME');
    const proxyPassword = this.configService.get<string>('PROXY_PASSWORD');

    if (this.proxyServer && proxyUsername && proxyPassword) {
      try {
        await page.authenticate({
          username: proxyUsername,
          password: proxyPassword,
        });
        this.logger.log('Proxy authentication successful');
      } catch (err) {
        this.logger.error(`Proxy authentication failed: ${err.message}`);
      }
    }
  }

  async resetPages() {
    if (!this.browser || !this.browser.isConnected()) {
      this.logger.log('browser is disconnected...');
      throw new Error('browser is disconnected...');
    }

    try {
      const pages = await this.browser.pages();

      // 關閉所有頁面
      for (const page of pages) {
        await page.close();
      }

      // 重建主頁面
      this.page = await this.browser.newPage();

      // 如果需要代理身份驗證
      if (this.proxyServer) {
        await this.authenticateProxyIfNeeded(this.page);
      }

      this.logger.log('browser pages are created.');
    } catch (err) {
      this.logger.error(`browser pages creation error: ${err.message}`);
    }
  }

  async fetchUrl(
    url: string,
    params?: {
      headers?: any;
      cookies?: any;
      waitUntil?: PuppeteerLifeCycleEvent;
      useProxy?: boolean; // 新增參數：是否使用代理
    },
  ): Promise<Page | undefined> {
    let retryTimes = 1;
    let isError = false;

    // 如果指定不使用代理，或需要重新設置代理狀態，則重置瀏覽器
    if (
      params?.useProxy !== undefined &&
      this.isProxyEnabled() !== params.useProxy
    ) {
      await this.setProxyEnabled(params.useProxy);
    }

    if (!this.page) {
      await this.resetPages();
    }

    while (retryTimes >= 0) {
      try {
        if (!this.page) {
          await this.resetPages();
        }

        if (params && params.cookies) {
          await this.page?.setCookie(...params.cookies);
        }

        if (params && params.headers) {
          await this.page?.setExtraHTTPHeaders(params.headers);
        }

        this.logger.log(`goto page: ${url} start`);

        this.pageResponse = await this.page?.goto(url, {
          waitUntil: params?.waitUntil || 'domcontentloaded',
          timeout: 30000,
        });

        isError = false;

        this.logger.log(`goto page: ${url} end`);

        break;
      } catch (err) {
        this.logger.error(`puppeteer 取得頁面資訊失敗: ${err.message}`);
        await this.resetBrowser();
        isError = true;
      }

      retryTimes -= 1;
    }

    if (isError) {
      throw new Error(`puppeteer 取得頁面資訊失敗, url: ${url}`);
    }

    return this.page;
  }

  async request(obj: {
    url: string;
    method: 'GET' | 'POST';
    data: any;
    headers?: any;
    useProxy?: boolean; // 新增參數：是否使用代理
  }) {
    try {
      const { url, method, data, headers, useProxy } = obj;

      // 添加代理配置到 HTTP 請求
      const config: any = { headers };

      // 根據參數決定是否使用代理
      if (useProxy !== false && this.proxyServer) {
        const proxyServer = this.proxyServer;

        if (proxyServer) {
          // 適用於 http:// 或 https:// 開頭的代理
          if (proxyServer.startsWith('http')) {
            config.proxy = {
              protocol: proxyServer.split('://')[0],
              host: proxyServer.split('://')[1].split(':')[0],
              port: parseInt(proxyServer.split(':').pop() || '80'),
            };
          }
          // 適用於僅包含 host:port 的代理
          else if (proxyServer.includes(':')) {
            config.proxy = {
              host: proxyServer.split(':')[0],
              port: parseInt(proxyServer.split(':')[1]),
            };
          }

          // 如果有用戶名密碼
          const proxyUsername =
            this.configService.get<string>('PROXY_USERNAME');
          const proxyPassword =
            this.configService.get<string>('PROXY_PASSWORD');

          if (proxyUsername && proxyPassword) {
            config.proxy.auth = {
              username: proxyUsername,
              password: proxyPassword,
            };
          }
        }
      }

      const response = await lastValueFrom(
        method === 'POST'
          ? this.httpService.post(url, data, config)
          : this.httpService.get(url, config),
      );

      return response.data;
    } catch (err) {
      this.logger.error(`httpService 取得頁面資訊失敗: ${err.message}`);
      throw err;
    }
  }

  getPage() {
    return this.page;
  }

  getPageResponse() {
    return this.pageResponse;
  }

  // 獲取當前代理狀態
  getProxyStatus() {
    return {
      enabled: this.isProxyEnabled(),
      server: this.proxyServer || 'Not configured',
    };
  }

  async testProxy(useProxy?: boolean) {
    try {
      // 如果明確指定了是否使用代理
      if (useProxy !== undefined) {
        await this.setProxyEnabled(useProxy);
      }

      if (!this.browser || !this.browser.isConnected()) {
        await this.resetBrowser();
      }

      if (!this.page) {
        await this.resetPages();
      }

      await this.page?.goto('https://ipinfo.io/json', {
        waitUntil: 'domcontentloaded',
      });

      const ipData = await this.page?.evaluate(() => {
        return JSON.parse(document.body.innerText);
      });

      return {
        success: true,
        ip: ipData.ip,
        country: ipData.country,
        region: ipData.region,
        city: ipData.city,
        org: ipData.org,
        proxyEnabled: this.isProxyEnabled(),
      };
    } catch (err) {
      this.logger.error(`Test proxy error: ${err.message}`);
      return {
        success: false,
        error: err.message,
        proxyEnabled: this.isProxyEnabled(),
      };
    }
  }
}
