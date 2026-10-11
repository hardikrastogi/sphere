import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

@UseGuards(AuthGuard('jwt'))
@Controller('chat')
export class ChatController {
  constructor(
    private chatService: ChatService,
    private chatGateway: ChatGateway,
  ) {}

  @Get('conversations')
  listConversations(@Req() req: any) {
    return this.chatService.listConversations(req.user.userId);
  }

  @Get('unread-count')
  unreadCount(@Req() req: any) {
    return this.chatService.unreadCount(req.user.userId);
  }

  @Get('conversations/:username')
  getOrCreateConversation(@Req() req: any, @Param('username') username: string) {
    return this.chatService.getOrCreateConversation(req.user.userId, username);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @Req() req: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.chatService.listMessages(
      req.user.userId,
      id,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Post('conversations/:id/read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    const result = await this.chatService.markRead(req.user.userId, id);
    if (result.markedCount > 0) {
      this.chatGateway.notifyRead(id, result.otherUserId);
    }
    return result;
  }
}
