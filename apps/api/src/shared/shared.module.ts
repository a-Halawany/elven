import { Global, Module } from '@nestjs/common';
import { EYE_CONFIG } from '../config/config.module.js';
import type { EyeConfig } from '../config/config.js';
import { createAppDb, createSystemDb, type Db } from './db.js';

export const APP_DB = Symbol('APP_DB');
export const SYSTEM_DB = Symbol('SYSTEM_DB');

@Global()
@Module({
  providers: [
    {
      provide: APP_DB,
      inject: [EYE_CONFIG],
      useFactory: (cfg: EyeConfig): Db => createAppDb(cfg),
    },
    {
      provide: SYSTEM_DB,
      inject: [EYE_CONFIG],
      useFactory: (cfg: EyeConfig): Db => createSystemDb(cfg),
    },
  ],
  exports: [APP_DB, SYSTEM_DB],
})
export class SharedModule {}
