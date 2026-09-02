/**
 * Exception filter for the observation routes.
 *
 * A deliberate refusal from a governed port is not an internal failure, and
 * answering 500 to one would tell the operator the system broke when in fact it
 * worked. This translates the refusals the ports raise into their honest HTTP
 * answers — and translates NOTHING ELSE, so a genuine fault still surfaces as
 * one rather than being dressed up as a business rule.
 *
 * The evidence is unaffected: the pipeline has already recorded the failure
 * through recordHandlerFailure before this filter ever sees the error.
 */
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import type { EyeRequest } from '../pipeline/http.js';
import { asObservationRefusal } from './observation-errors.js';

@Catch()
export class ObservationExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<EyeRequest>();
    const correlationId = req.eyeCorrelationId ?? newId();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res.status(exception.getStatus()).json(
        typeof body === 'object' ? body : errorBody('EYE_REQ_001', correlationId));
      return;
    }

    const refusal = asObservationRefusal(exception, correlationId);
    if (refusal !== null) {
      const body = refusal.getResponse();
      res.status(refusal.getStatus()).json(
        typeof body === 'object' ? body : errorBody('EYE_STA_002', correlationId));
      return;
    }

    // Not a rule we recognise: it stays an internal failure, and the detail stays
    // server-side.
    // eslint-disable-next-line no-console
    console.error(`[eye-api] observation internal error corr=${correlationId}:`, exception);
    res.status(500).json(errorBody('EYE_INT_001', correlationId, 'internal integrity or processing failure'));
  }
}
