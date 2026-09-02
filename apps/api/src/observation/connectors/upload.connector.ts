/**
 * Operator upload connector — cohort 1 (PDF / DOCX / CSV).
 *
 * The bytes are already in hand, so there is no egress and no schedule; what this
 * connector contributes is the SAME framing and the SAME transport-evidence shape
 * as a network connector, so an uploaded PDF and a polled JSON row travel one
 * admission path and carry one custody vocabulary.
 *
 * The operator's own identity is the transport evidence here — there is no TLS
 * claim to make and none is invented. `tlsVerified` and `originAllowlisted` are
 * NULL, not `true`, and the four authenticity concepts record the same.
 */
import { createHash } from 'node:crypto';
import type { AcquiredItem, AcquisitionContext, AcquisitionOutput, Connector } from './sdk.js';

const VERSION = '1.0.0';
export const UPLOAD_METHOD_REF = `operator-upload-framing@${VERSION}`;

export interface UploadedFile {
  filename: string;
  declaredMediaType: string | null;
  bytes: Uint8Array;
  /** The operator who supplied the file — the accountable identity for this item. */
  operator: string;
  /** The operator's stated time for the document, when they supply one. Never invented. */
  documentTime?: string | null;
}

export class UploadConnector implements Connector {
  readonly kind = 'upload' as const;
  readonly name = 'collection.upload';
  readonly version = VERSION;
  readonly codeDigest = createHash('sha256')
    .update(`${this.name}@${VERSION}:${UPLOAD_METHOD_REF}`)
    .digest('hex');

  constructor(private readonly files: UploadedFile[]) {}

  async acquire(ctx: AcquisitionContext): Promise<AcquisitionOutput> {
    const items: AcquiredItem[] = [];
    let bytesTransferred = 0;
    for (const f of this.files) {
      ctx.budget.spendRequest();
      ctx.budget.spendBytes(f.bytes.byteLength);
      bytesTransferred += f.bytes.byteLength;
      items.push({
        // The upload's natural key is the filename paired with the exact bytes'
        // digest: re-uploading the same file is the same item; a changed file
        // under the same name is a different one.
        itemKey: `upload:${f.filename}@${createHash('sha256').update(f.bytes).digest('hex').slice(0, 16)}`,
        bytes: f.bytes,
        declaredMediaType: f.declaredMediaType,
        filename: f.filename,
        publisherTime: f.documentTime ?? null,
        transport: {
          connector: this.name,
          connectorVersion: VERSION,
          methodRef: UPLOAD_METHOD_REF,
          endpoint: null,
          httpStatus: null,
          retainedHeaders: {},
          // No transport claim is available for an operator upload, so none is made.
          tlsVerified: null,
          originAllowlisted: null,
        },
      });
    }
    return { items, checkpoint: ctx.checkpoint ?? {}, bytesTransferred, requestsMade: items.length };
  }
}
