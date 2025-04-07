import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { GamerParserDto } from './dto/gamer-parser.dto';
import { Sleep } from 'src/common/functions/sleep.helper';
import * as cheerio from 'cheerio';

interface GamerHeaders {
  'User-Agent': string;
  Cookie?: string;
  [key: string]: any; // Add index signature to allow additional string keys
}

@Injectable()
export class AnimeService {
  private logger = new Logger(AnimeService.name);

  private readonly loginUrl =
    'https://api.gamer.com.tw/mobile_app/user/v3/do_login.php';

  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

  private cookies = {};

  private deviceId = '';

  private headers: GamerHeaders;

  constructor(private readonly httpService: HttpService) {}

  setCookieString() {
    const selectedCookies = Object.entries(this.cookies).filter(([name]) => {
      return (
        name.startsWith('BAHARUNE') ||
        name.startsWith('ANIME_SIGN') ||
        name.startsWith('ckM') ||
        name.startsWith('BAHAID') ||
        name.startsWith('BAHAENUR')
      );
    });
    this.headers.Cookie = selectedCookies
      .map(([name, value]: [string, string]) => `${name}=${value}`)
      .join('; ');
  }

  async reGenDeviceId() {
    const deviceInfo = await this.getDeviceId(this.headers);
    this.deviceId = deviceInfo.deviceId;
    for (const cookie of deviceInfo.cookies) {
      this.cookies[cookie.name] = cookie.value;
    }
    this.setCookieString();
  }

  private async getSNFromUrl(url: string): Promise<string> {
    let SN = '';
    try {
      this.logger.log(`正在從 URL 解析 SN: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get(url, { headers: this.headers }),
      );
      const html = response.data;

      const $ = cheerio.load(html);
      const ogUrl = $('meta[property="og:url"]').attr('content') || '';
      const ogMatch = ogUrl.match(/animeVideo\.php\?sn=(\d+)/);

      if (ogMatch && ogMatch[1]) {
        SN = ogMatch[1];
      } else {
        const videoLink =
          $('a[href*="animeVideo.php?sn="]').first().attr('href') || '';
        const linkMatch = videoLink.match(/sn=(\d+)/);

        if (linkMatch && linkMatch[1]) {
          SN = linkMatch[1];
        }
      }
    } catch (error) {
      this.logger.error(`獲取 SN 失敗: ${error.message}`);
      throw error;
    }
    return SN;
  }

  async getM3U8Dict(dto: GamerParserDto) {
    const { url } = dto;

    this.headers = { 'User-Agent': this.userAgent, Cookie: '' };

    this.setCookieString();

    let ret = {};

    this.logger.log(`嘗試登入...`);

    await this.login(
      process.env.GAMER_USER || '',
      process.env.GAMER_PASSWORD || '',
    );

    this.logger.log(`嘗試獲取設備 ID...`);
    await this.reGenDeviceId();
    this.logger.log(`設備 ID: ${this.deviceId}`);

    this.logger.log(`嘗試獲取 SN...`);
    const sn = await this.getSNFromUrl(url);
    this.logger.log(`取得 SN: ${sn}`);

    this.logger.log(`獲取用戶資訊...`);
    const userInfo = await this.gainAccess(sn);
    this.logger.log(`用戶資訊: ${JSON.stringify(userInfo)}`);

    ret = await this.unlock(sn);
    this.logger.log(`解鎖結果: ${JSON.stringify(ret)}`);

    ret = await this.checkLock(sn);
    this.logger.log(`鎖定結果: ${JSON.stringify(ret)}`);

    const refererUrl = `https://ani.gamer.com.tw/animeVideo.php?sn=${sn}`;
    let m3u8Url = '';

    if (!userInfo.vip) {
      await this.startAd(sn);
      await Sleep(25000);
      await this.skipAd(sn);
      try {
        await this.videoStart(sn);
        await this.checkNoAd(sn);
        const playlist = await this.getPlaylist(sn);
        if (playlist.src !== '') {
          m3u8Url = playlist.src;
        } else if (playlist.error && playlist.error.code === 1007) {
          await this.unlock(sn);
          await this.reGenDeviceId();
        }
      } catch (error) {
        this.logger.error(`廣告跳過失敗: ${error.message}`);
      }
    } else {
      this.logger.log(`VIP帳戶, 立即下載`);
    }

    return {
      success: true,
      sn,
      m3u8Url,
      referer: refererUrl,
    };
  }

  async login(username: string, password: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.loginUrl,
          new URLSearchParams({
            uid: username,
            passwd: password,
            vcode: '7045',
          }),
          {
            headers: {
              'User-Agent': this.userAgent,
              Cookie: 'ckAPP_VCODE=7045',
              Accept: '*/*',
              Host: 'api.gamer.com.tw',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );
      const cookies = response.headers['set-cookie'];
      if (!cookies) {
        throw new Error('無法獲取 Cookies');
      }
      cookies.map((cookie) => {
        const [name, value] = cookie.split(';')[0].split('=');
        this.cookies[name] = value;
      });
      this.setCookieString();
    } catch (error) {
      throw new Error(`登入失敗：${error.message}`);
    }
  }

  private async getDeviceId(headers: any) {
    const url = 'https://ani.gamer.com.tw/ajax/getdeviceid.php';
    const response = await firstValueFrom(
      this.httpService.get(url, { headers }),
    );
    const cookies = response.headers['set-cookie'];
    if (!cookies) {
      throw new Error('無法獲取 Cookies');
    }
    const bunchOfCookies = cookies.map((cookie) => {
      const [name, value] = cookie.split(';')[0].split('=');
      return { name, value };
    });
    return { deviceId: response.data.deviceid, cookies: bunchOfCookies };
  }

  private async gainAccess(sn: string): Promise<any> {
    const hash = this.randomString(12);
    const url = `https://ani.gamer.com.tw/ajax/token.php?adID=0&sn=${sn}&device=${this.deviceId}&hash=${hash}`;
    const res = await firstValueFrom(
      this.httpService.get(url, { headers: this.headers }),
    );
    return res.data;
  }

  private async unlock(sn: string) {
    const url = `https://ani.gamer.com.tw/ajax/unlock.php?sn=${sn}&ttl=0`;
    const res = await firstValueFrom(
      this.httpService.get(url, { headers: this.headers }),
    );
    return res.data;
  }

  private async checkLock(sn: string) {
    const url = `https://ani.gamer.com.tw/ajax/checklock.php?device=${this.deviceId}&sn=${sn}`;
    const res = await firstValueFrom(
      this.httpService.get(url, { headers: this.headers }),
    );
    return res.data;
  }

  private async startAd(sn: string): Promise<void> {
    const url = `https://ani.gamer.com.tw/ajax/videoCastcishu.php?sn=${sn}&s=194699`;
    await firstValueFrom(this.httpService.get(url, { headers: this.headers }));
  }

  private async skipAd(sn: string): Promise<void> {
    const url = `https://ani.gamer.com.tw/ajax/videoCastcishu.php?sn=${sn}&s=194699&ad=end`;
    await firstValueFrom(this.httpService.get(url, { headers: this.headers }));
  }

  private async videoStart(sn: string): Promise<void> {
    const url = `https://ani.gamer.com.tw/ajax/videoStart.php?sn=${sn}`;
    const res = await firstValueFrom(
      this.httpService.get(url, { headers: this.headers }),
    );
    this.logger.log(`開始播放: ${JSON.stringify(res.data)}`);
  }

  private async checkNoAd(sn: string, errorCount = 10): Promise<void> {
    const hash = this.randomString(12);
    const url = `https://ani.gamer.com.tw/ajax/token.php?sn=${sn}&device=${this.deviceId}&hash=${hash}`;
    const res = await firstValueFrom(
      this.httpService.get(url, { headers: this.headers }),
    );
    const data = res.data;
    this.logger.log(`廣告檢查: ${JSON.stringify(data)}`);
  }

  private async getPlaylist(sn: string) {
    const url = `https://ani.gamer.com.tw/ajax/m3u8.php?sn=${sn}&device=${this.deviceId}`;
    const res = await firstValueFrom(
      this.httpService.get(url, { headers: this.headers }),
    );
    return res.data;
  }

  private randomString(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
