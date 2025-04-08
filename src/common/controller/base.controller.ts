import { Controller, Logger } from '@nestjs/common';
import { Site } from '../enums/site.enum';
import path from 'path';

@Controller('parser')
export class BaseController {
  getGamerJsonPath(site: Site) {
    return path.join(process.cwd(), 'store', site, `${Site.ANIME1}.json`);
  }
}
