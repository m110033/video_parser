import { IsOptional, IsString } from 'class-validator';

export class Anime1ParserDto {
    @IsOptional()
    @IsString()
    cat: string;
}
