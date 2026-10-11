import { Module } from '@nestjs/common';
import { CallsService } from './calls.service';
import { CallStateService } from './call-state.service';

@Module({
  providers: [CallsService, CallStateService],
  exports: [CallsService, CallStateService],
})
export class CallsModule {}
