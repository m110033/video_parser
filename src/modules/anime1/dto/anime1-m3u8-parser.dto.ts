import { IsOptional, IsString } from 'class-validator';

export class Anime1M3u8ParserDto {
  @IsOptional()
  @IsString()
  cat?: string;

  @IsOptional()
  @IsString()
  url: string = '';
}
