import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GamerParserDto {
  @IsNotEmpty()
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  adId?: string;
}
