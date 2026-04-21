import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

interface ErrorResponse {
  data: null;
  error: {
    statusCode: number;
    message: string | string[];
    code?: string;
    timestamp: string;
    path: string;
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<{ url: string }>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'object' && response !== null) {
        const resp = response as Record<string, unknown>;
        message = (resp['message'] as string | string[]) ?? message;
        code = resp['code'] as string | undefined;
      } else {
        message = response as string;
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    }

    const body: ErrorResponse = {
      data: null,
      error: {
        statusCode,
        message,
        code,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };

    reply.status(statusCode).send(body);
  }
}
