import { Global, Module } from '@nestjs/common';
import { EYE_CONFIG } from '../config/config.module.js';
import type { EyeConfig } from '../config/config.js';
import {
  createAppDb, createCommitDb, createIdentityDb, createPublisherDb, createVerifierDb, type Db,
} from './db.js';

/** One injection token per AUTHORITY — see db.ts for the privilege boundary. */
export const APP_DB = Symbol('APP_DB');
export const COMMIT_DB = Symbol('COMMIT_DB');
export const IDENTITY_DB = Symbol('IDENTITY_DB');
export const PUBLISHER_DB = Symbol('PUBLISHER_DB');
export const VERIFIER_DB = Symbol('VERIFIER_DB');

@Global()
@Module({
  providers: [
    { provide: APP_DB, inject: [EYE_CONFIG], useFactory: (c: EyeConfig): Db => createAppDb(c) },
    { provide: COMMIT_DB, inject: [EYE_CONFIG], useFactory: (c: EyeConfig): Db => createCommitDb(c) },
    { provide: IDENTITY_DB, inject: [EYE_CONFIG], useFactory: (c: EyeConfig): Db => createIdentityDb(c) },
    { provide: PUBLISHER_DB, inject: [EYE_CONFIG], useFactory: (c: EyeConfig): Db => createPublisherDb(c) },
    { provide: VERIFIER_DB, inject: [EYE_CONFIG], useFactory: (c: EyeConfig): Db => createVerifierDb(c) },
  ],
  exports: [APP_DB, COMMIT_DB, IDENTITY_DB, PUBLISHER_DB, VERIFIER_DB],
})
export class SharedModule {}
