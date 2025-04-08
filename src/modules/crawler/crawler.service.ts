import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import { Browser, HTTPResponse, Page, PuppeteerLifeCycleEvent } from 'puppeteer';
import * as chromium from 'chromium';

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  private browser?: Browser;

  private page?: Page;

  private pageResponse?: HTTPResponse | null;

  constructor() {}

  async init() {
    return await this.resetBrowser();
  }

  async resetBrowser() {
    if (this.browser) {
      return;
    }

    try {
      this.browser = await puppeteer.launch({
        args: ['--disable-gpu', '--disable-setuid-sandbox', '--no-sandbox', '--no-zygote'],
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

  async resetPages() {
    if (!this.browser || !this.browser.isConnected()) {
      this.logger.log('browser is disconnected...');
      throw new Error('browser is disconnected...');
    }

    try {
      // 獲取第一個頁面，如果沒有則創建新頁面
      this.page = await this.browser.pages()[0];

      if (!this.page) {
        this.page = await this.browser.newPage();
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

        this.pageResponse = await this.page?.goto(url, {
          waitUntil: params?.waitUntil || 'domcontentloaded',
          timeout: 30000,
        });

        isError = false;
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

  getPage() {
    return this.page;
  }

  getPageResponse() {
    return this.pageResponse;
  }
}
