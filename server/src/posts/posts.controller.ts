import { Body, Controller, Delete, Param, Post, Req, UseGuards, Get, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';


@Controller('posts')
export class PostsController {
  constructor(private postsService: PostsService) {}

  @UseGuards(AuthGuard('jwt'))
@Get()
getFeed(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
  return this.postsService.getFeed(
    req.user.userId,
    limit ? parseInt(limit, 10) : undefined,
    offset ? parseInt(offset, 10) : undefined,
  );
}
@UseGuards(AuthGuard('jwt'))
@Get('explore')
getExplore(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
  return this.postsService.getExploreFeed(
    req.user.userId,
    limit ? parseInt(limit, 10) : undefined,
    offset ? parseInt(offset, 10) : undefined,
  );
}

  @UseGuards(AuthGuard('jwt'))
@Get(':id/comments')
getComments(@Req() req: any, @Param('id') postId: string) {
  return this.postsService.getComments(req.user.userId, postId);
}

@UseGuards(AuthGuard('jwt'))
@Post(':id/comments')
addComment(@Req() req: any, @Param('id') postId: string, @Body() dto: CreateCommentDto) {
  return this.postsService.addComment(req.user.userId, postId, dto.text);
}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Req() req: any, @Body() dto: CreatePostDto) {
    return this.postsService.create(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/like')
  like(@Req() req: any, @Param('id') postId: string) {
    return this.postsService.likePost(req.user.userId, postId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id/like')
  unlike(@Req() req: any, @Param('id') postId: string) {
    return this.postsService.unlikePost(req.user.userId, postId);
  }

  // Placed last so it can never shadow the more specific routes above (explore, :id/comments, etc.)
  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  getPost(@Req() req: any, @Param('id') postId: string) {
    return this.postsService.getPostById(req.user.userId, postId);
  }
}