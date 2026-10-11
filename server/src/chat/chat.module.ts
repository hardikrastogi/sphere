import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { PresenceService } from './presence.service';
import { CallsModule } from '../calls/calls.module';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET }), CallsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, PresenceService],
})
export class ChatModule {}
