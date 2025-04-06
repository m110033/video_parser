import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { CapSolverTaskModel } from './models/cap-solver-task.model';
import { Sleep } from 'src/common/functions/sleep.helper';

export interface GetTaskResultByCaptchaSolver {
  status: string;

  solution?: any;
}

@Injectable()
export class CrawlerCaptchaSolverService {
  protected readonly logger = new Logger(CrawlerCaptchaSolverService.name);

  constructor(protected readonly httpService: HttpService) {}

  async getByAxios(url: string, params?: { headers?: any; cookies?: any }) {
    const ret = await this.httpService.axiosRef.get(url, params);
    if (ret.status !== 200) {
      throw new Error(ret.statusText);
    }
    return ret;
  }

  async postByAxios(
    url: string,
    body: any,
    params?: { headers: any },
  ): Promise<any> {
    const ret = await this.httpService.axiosRef.post(url, body, params);
    if (ret.status !== 200) {
      throw new Error(ret.statusText);
    }
    return ret;
  }

  async issueCaptchaSolver(captchaParams: CapSolverTaskModel) {
    return this.createTaskByCapSolver(captchaParams);
  }

  async createTaskByCapSolver(params: CapSolverTaskModel) {
    this.logger.log('log', `createTaskByCapSolver: ${JSON.stringify(params)}`);
    const response = await this.httpService.axiosRef.post(
      'https://api.capsolver.com/createTask',
      {
        clientKey: process.env.CAPTCHA_API_KEY,
        task: params,
      },
    );
    const ret = {
      status: response.data.status,
      taskId: response.data.taskId,
    };
    return ret;
  }

  async getTaskResultByCapSolver(
    taskId: string,
  ): Promise<GetTaskResultByCaptchaSolver> {
    let maxRetry = 10;

    let data;

    do {
      await Sleep(1000);

      const response = await this.httpService.axiosRef.post(
        'https://api.capsolver.com/getTaskResult',
        {
          clientKey: process.env.CAPTCHA_API_KEY,
          taskId: taskId,
        },
      );

      data = response.data;

      if (data.status === 'ready') {
        return data;
      }

      if (data.status === 'failed') {
        break;
      }

      maxRetry -= 1;
    } while (maxRetry > 0);

    throw new Error(`CAPTCHA SOLVER 失敗: ${JSON.stringify(data)}`);
  }
}
