import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(30)
  username?: string;

  @IsOptional() @IsString() @MaxLength(150)
  bio?: string;

  @IsOptional() @IsString()
  avatarUrl?: string;

  @IsOptional() @IsBoolean()
  isPrivate?: boolean;

  @IsOptional() @IsBoolean()
  showActivityStatus?: boolean;
}