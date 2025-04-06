import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GamerParserDto {
  @IsNotEmpty()
  @IsString()
  url: string;

  @IsBoolean()
  @IsOptional()
  usePuppeteer?: boolean = true;
}
