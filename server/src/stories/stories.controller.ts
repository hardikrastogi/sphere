import { Body, Controller, Post, Req, UseGuards, Get, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';

@Controller('stories')

export class StoriesController {
  constructor(private storiesService: StoriesService) {}
@UseGuards(AuthGuard('jwt'))
@Get('active')
getActive(@Req() req: any) {
  return this.storiesService.getActiveStories(req.user.userId);
}
  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Req() req: any, @Body() dto: CreateStoryDto) {
    return this.storiesService.create(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
@Get('user/:authorId')
getByAuthor(@Param('authorId') authorId: string) {
  return this.storiesService.getStoriesByAuthor(authorId);
}

@UseGuards(AuthGuard('jwt'))
@Post(':id/view')
markViewed(@Req() req: any, @Param('id') storyId: string) {
  return this.storiesService.markViewed(req.user.userId, storyId);
}

@UseGuards(AuthGuard('jwt'))
@Get(':id/views')
getViewers(@Req() req: any, @Param('id') storyId: string) {
  return this.storiesService.getViewers(req.user.userId, storyId);
}

}