import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { ObjectsService } from './objects.service.js';
import { ObjectsController } from './objects.controller.js';
import { OutboxPublisher } from './outbox.publisher.js';
/* B50 lc */
import { LifecycleController } from './lifecycle/lifecycle.controller.js';
import { LifecycleService } from './lifecycle/lifecycle.service.js';
/* end B50 lc */
/* B82 ts */
import { DisplayTruthController } from './truth/display-truth.controller.js';
/* end B82 ts */

@Module({
  imports: [PipelineModule],
  controllers: [ObjectsController, /* B50 lc */ LifecycleController /* end B50 lc */, /* B82 ts */ DisplayTruthController /* end B82 ts */],
  providers: [ObjectsService, OutboxPublisher, /* B50 lc */ LifecycleService /* end B50 lc */],
  exports: [ObjectsService],
})
export class ObjectsModule {}
