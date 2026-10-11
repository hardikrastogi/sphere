import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FollowService } from './follow.service';

@UseGuards(AuthGuard('jwt'))
@Controller()
export class FollowController {
  constructor(private followService: FollowService) {}

  @Post('users/:username/follow')
  follow(@Req() req: any, @Param('username') username: string) {
    return this.followService.sendRequest(req.user.userId, username);
  }

  @Delete('users/:username/follow')
  unfollow(@Req() req: any, @Param('username') username: string) {
    return this.followService.removeFollow(req.user.userId, username);
  }

  @Post('users/:username/follow/accept')
  acceptFrom(@Req() req: any, @Param('username') username: string) {
    return this.followService.acceptRequestFrom(req.user.userId, username);
  }

  @Post('users/:username/follow/reject')
  rejectFrom(@Req() req: any, @Param('username') username: string) {
    return this.followService.rejectRequestFrom(req.user.userId, username);
  }

  @Get('users/:username/followers')
  listFollowers(@Req() req: any, @Param('username') username: string) {
    return this.followService.listFollowers(req.user.userId, username);
  }

  @Get('users/:username/following')
  listFollowing(@Req() req: any, @Param('username') username: string) {
    return this.followService.listFollowing(req.user.userId, username);
  }

  @Get('follow-requests')
  listRequests(@Req() req: any) {
    return this.followService.listPendingRequests(req.user.userId);
  }

  @Post('follow-requests/:id/accept')
  accept(@Req() req: any, @Param('id') id: string) {
    return this.followService.acceptRequest(req.user.userId, id);
  }

  @Post('follow-requests/:id/reject')
  reject(@Req() req: any, @Param('id') id: string) {
    return this.followService.rejectRequest(req.user.userId, id);
  }
}
