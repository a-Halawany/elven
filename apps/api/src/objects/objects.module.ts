import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { ObjectsService } from './objects.service.js';
import { ObjectsController } from './objects.controller.js';
import { OutboxPublisher } from './outbox.publisher.js';

@Module({
  imports: [PipelineModule],
  controllers: [ObjectsController],
  providers: [ObjectsService, OutboxPublisher],
  exports: [ObjectsService],
})
export class ObjectsModule {}
