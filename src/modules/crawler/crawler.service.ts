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

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  private browser?: Browser;

  private page?: Page;

  private pageResponse?: HTTPResponse | null;

  constructor(private readonly httpService: HttpService) {}

  async init() {
    return await this.resetBrowser();
  }

  async resetBrowser() {
    // 關閉瀏覽器
    try {
      await this.browser?.close();
    } catch (err) {
      this.logger.error(`close browser error: ${err.message}`);
    }

    try {
      this.browser = await puppeteer.use(StealthPlugin()).launch({
        args: [
          '--disable-gpu',
          '--disable-setuid-sandbox',
          '--no-sandbox',
          '--no-zygote',
        ],
        headless: true,
        acceptInsecureCerts: true,
        executablePath: chromium.path,
      });

      this.logger.log('browser launched.');
    } catch (err) {
      this.logger.error(`reset browser error: ${err.message}`);
    }

    return await this.resetPages();
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
      useCloudPage?: boolean;
    },
  ): Promise<Page | undefined> {
    let retryTimes = 1;
    let isError = false;

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
  }) {
    try {
      const { url, method, data, headers } = obj;

      const response = await lastValueFrom(
        this.httpService.post(url, data, { headers: headers }),
      );

      return response.data;
    } catch (err) {
      this.logger.error(`httpService 取得頁面資訊失敗: ${err.message}`);
      throw err;
    }
  }

  getPage(useCloudPage = false) {
    return this.page;
  }

  getPageResponse() {
    return this.pageResponse;
  }
}
