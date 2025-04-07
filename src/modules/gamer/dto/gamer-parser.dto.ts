import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GamerParserDto {
  @IsOptional()
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  sn: string;

  @IsBoolean()
  @IsOptional()
  usePuppeteer?: boolean = true;
}
