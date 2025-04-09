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

  protected stripHtml(html: string): string {
    // 移除所有 HTML 標籤
    return html
      .replace(/<[^>]*>?/gm, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n\s*\n/g, '\n') // 移除多餘的換行
      .trim();
  }
}
