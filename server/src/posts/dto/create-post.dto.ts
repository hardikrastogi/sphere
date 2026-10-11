import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class MediaItemDto {
  @IsString()
  url!: string;

  @IsString()
  publicId!: string;

  @IsString()
  type!: 'PHOTO' | 'VIDEO';
}

export class CreatePostDto {
  @IsOptional()
  @IsString()
  caption?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  media!: MediaItemDto[];
}