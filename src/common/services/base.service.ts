import { Injectable } from '@nestjs/common';

@Injectable()
export class BaseService {
  protected strBetween(str: string, start: string, end: string): string {
    const startIndex = str.indexOf(start);
    if (startIndex === -1) return '';

    const startPosWithOffset = startIndex + start.length;
    const endIndex = str.indexOf(end, startPosWithOffset);

    if (endIndex === -1) return '';

    return str.substring(startPosWithOffset, endIndex);
  }
}
