import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { catchError, lastValueFrom } from 'rxjs';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);
  private readonly appUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // 從環境變數取得應用 URL，或使用默認值
    this.appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3000';
  }

  @Cron('0 */14 * * * *') // 每 14 分鐘執行一次
  async keepAlive() {
    try {
      this.logger.log('執行定時保活任務...');

      // 呼叫健康檢查接口
      const response = await lastValueFrom(
        this.httpService.get(`${this.appUrl}/system/health`).pipe(
          catchError((error) => {
            this.logger.error(`保活請求失敗: ${error.message}`);
            throw error;
          }),
        ),
      );

      this.logger.log(
        `保活請求成功! 狀態: ${response.status}, 回應: ${JSON.stringify(response.data)}`,
      );
    } catch (error) {
      this.logger.error(`保活任務失敗: ${error.message}`);
    }
  }

  // 在應用啟動時也執行一次
  async onApplicationBootstrap() {
    await this.keepAlive();
  }
}
