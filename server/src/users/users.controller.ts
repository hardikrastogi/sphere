import { Body, Controller, Get, Param, Patch, Req, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getMe(@Req() req: any) {
    return this.usersService.findById(req.user.userId);
  }
  @UseGuards(AuthGuard('jwt'))
@Get('search')
search(@Query('q') query: string) {
  return this.usersService.searchUsers(query);
}

  @UseGuards(AuthGuard('jwt'))
  @Patch('me')
  updateMe(@Req() req: any, @Body() dto: UpdateUserDto) {
    return this.usersService.update(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':username')
  getProfile(@Req() req: any, @Param('username') username: string) {
    return this.usersService.getProfile(req.user.userId, username);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':username/posts')
  getUserPosts(
    @Req() req: any,
    @Param('username') username: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.usersService.getUserPosts(
      req.user.userId,
      username,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }
}