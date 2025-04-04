import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GamerParserDto {
  @IsNotEmpty()
  @IsString()
  sn: string;

  @IsOptional()
  @IsString()
  adId?: string;
}
