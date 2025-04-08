import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';

type ResponseBody = {
  code: string;
  message: string;
  error?: any;
};

type ExceptionResponse = {
  statusCode: number;
  message: any[];
  error: string;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<any>();

    const responseBody: ResponseBody = {
      code: '400001',
      message: exception.message,
    };

    const responseObj = {
      response: response,
      body: responseBody,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };

    if (exception instanceof UnauthorizedException) {
      /** 無權限錯誤，一律回傳 401 */
      responseObj.body.message = 'unauthorized';
      responseObj.status = HttpStatus.UNAUTHORIZED;
    } else if (exception instanceof NotFoundException) {
      responseObj.body.message = 'not found';
      responseObj.status = HttpStatus.NOT_FOUND;
    } else {
      responseObj.body.message = 'unknown error';
      responseObj.body.error = exception.message;
    }

    this.logger.error(`Exception: ${exception.message}`);

    return response.status(responseObj.status).json({
      ...responseObj.body,
    });
  }
}
