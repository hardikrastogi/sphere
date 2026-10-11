import { IsIn, IsString } from 'class-validator';

export class CreateStoryDto {
  @IsString()
  url!: string;

  @IsString()
  publicId!: string;

  @IsIn(['PHOTO', 'VIDEO'])
  type!: 'PHOTO' | 'VIDEO';
}