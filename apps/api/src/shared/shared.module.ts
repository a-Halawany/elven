import { Global, Module } from '@nestjs/common';
import { EYE_CONFIG } from '../config/config.module.js';
import type { EyeConfig } from '../config/config.js';
import { createAppDb, type Db } from './db.js';

export const APP_DB = Symbol('APP_DB');

@Global()
@Module({
  providers: [
    {
      provide: APP_DB,
      inject: [EYE_CONFIG],
      useFactory: (cfg: EyeConfig): Db => createAppDb(cfg),
    },
  ],
  exports: [APP_DB],
})
export class SharedModule {}
