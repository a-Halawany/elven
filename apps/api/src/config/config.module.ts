import { Global, Module } from '@nestjs/common';
import { loadConfig, type EyeConfig } from './config.js';

export const EYE_CONFIG = Symbol('EYE_CONFIG');

@Global()
@Module({
  providers: [{ provide: EYE_CONFIG, useFactory: (): EyeConfig => loadConfig() }],
  exports: [EYE_CONFIG],
})
export class ConfigModule {}
