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
import axios from 'axios';

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
    if (this.browser) {
      return;
    }

    try {
      this.browser = await puppeteer.launch({
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

  async request({
    url,
    headers,
    method = 'GET',
    data = null,
  }: {
    url: string;
    headers?: Record<string, string>;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: any;
  }) {
    try {
      // 設置請求配置
      const config: any = {
        headers: headers || {},
      };

      // 發送請求
      let response;
      switch (method) {
        case 'POST':
          response = await lastValueFrom(
            this.httpService.post(url, data, config),
          );
          break;
        case 'PUT':
          response = await lastValueFrom(
            this.httpService.put(url, data, config),
          );
          break;
        case 'DELETE':
          response = await lastValueFrom(this.httpService.delete(url, config));
          break;
        default: // GET
          response = await lastValueFrom(this.httpService.get(url, config));
          break;
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        this.logger.warn(
          `請求返回錯誤狀態碼 ${error.response.status}: ${url}`,
          error.response.data,
        );
        return error.response.data;
      }

      this.logger.error(`請求失敗 [${url}]: ${error.message}`, error.stack);
      throw error;
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
