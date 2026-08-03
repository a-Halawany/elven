/** Central identifier issuer — UUIDv7, non-semantic (ADR-P0-11, ES-25-001). */
import { uuidv7 } from 'uuidv7';

export function newId(): string {
  return uuidv7();
}
