// Shared normalization for Runtime ErrorInfo and retry progress payloads.
// The server owns classification and retry safety; the Web UI only preserves
// that decision while providing a safe localized fallback for display.

export function normalizeErrorInfo(value) {
  if (!value) return null;
  const source = errorSource(value);
  if (!source) return null;
  const info = { ...source };
  info.message = stringValue(firstDefined(source.message, source.Message, source.errorMessage));
  info.code = stringValue(firstDefined(source.code, source.Code));
  info.type = stringValue(firstDefined(source.type, source.Type));
  info.failureClass = stringValue(firstDefined(source.failureClass, source.failure_class, source.FailureClass));
  info.phase = stringValue(firstDefined(source.phase, source.Phase));
  info.messageKey = stringValue(firstDefined(source.messageKey, source.message_key, source.MessageKey));
  info.retryMode = stringValue(firstDefined(source.retryMode, source.retry_mode, source.RetryMode));
  info.retryable = Boolean(firstDefined(source.retryable, source.Retryable));
  info.retryAfterMs = positiveNumber(firstDefined(source.retryAfterMs, source.retry_after_ms, source.RetryAfterMs));
  info.attempt = positiveNumber(firstDefined(source.attempt, source.Attempt));
  info.maxAttempts = positiveNumber(firstDefined(source.maxAttempts, source.max_attempts, source.MaxAttempts));
  info.sideEffectState = stringValue(firstDefined(source.sideEffectState, source.side_effect_state, source.SideEffectState));
  info.partialOutput = Boolean(firstDefined(source.partialOutput, source.partial_output, source.PartialOutput));
  info.runId = stringValue(firstDefined(source.runId, source.runID, source.run_id, source.RunID));
  info.intentId = stringValue(firstDefined(source.intentId, source.intentID, source.intent_id, source.IntentID));
  info.requestId = stringValue(firstDefined(source.requestId, source.requestID, source.request_id, source.RequestID));
  const rawDetail = firstDefined(source.detail, source.Detail, source.details, source.Details);
  const nestedDetail = rawDetail && typeof rawDetail === 'object'
    ? firstDefined(rawDetail.detail, rawDetail.Detail, rawDetail.details, rawDetail.Details)
    : rawDetail;
  info.detail = stringValue(nestedDetail);
  return info;
}

export function normalizeRetryInfo(value) {
  if (!value || typeof value !== 'object') return null;
  const source = value.retry && typeof value.retry === 'object' ? value.retry : value;
  return {
    ...source,
    state: stringValue(firstDefined(source.state, source.State)) || 'retrying',
    phase: stringValue(firstDefined(source.phase, source.Phase)),
    reasonCode: stringValue(firstDefined(source.reasonCode, source.reason_code, source.ReasonCode)),
    messageKey: stringValue(firstDefined(source.messageKey, source.message_key, source.MessageKey)),
    message: stringValue(firstDefined(source.message, source.Message)),
    retryAfterMs: positiveNumber(firstDefined(source.retryAfterMs, source.retry_after_ms, source.RetryAfterMs)),
    attempt: positiveNumber(firstDefined(source.attempt, source.Attempt)),
    maxAttempts: positiveNumber(firstDefined(source.maxAttempts, source.max_attempts, source.MaxAttempts)),
    runId: stringValue(firstDefined(source.runId, source.runID, source.run_id, source.RunID)),
    intentId: stringValue(firstDefined(source.intentId, source.intentID, source.intent_id, source.IntentID))
  };
}

export function errorDisplayMessage(value, tr = (key) => key, fallback = '') {
  const info = normalizeErrorInfo(value);
  if (!info) return fallback;
  const detail = String(info.detail || '').trim();
  if (info.messageKey) {
    const localized = tr(info.messageKey, {
      attempt: info.attempt,
      maxAttempts: info.maxAttempts,
      retryAfterMs: info.retryAfterMs
    });
    if (localized && localized !== info.messageKey) {
      if (detail && detail !== info.message) return `${localized}: ${detail}`;
      if (detail) return detail;
      return localized;
    }
  }
  return info.message || detail || fallback;
}

export function canRetryError(value) {
  const info = normalizeErrorInfo(value);
  if (!info?.runId) return false;
  return info.retryMode === 'user' || (info.retryMode === 'automatic' && info.retryable);
}

export function requiresRetryConfirmation(value) {
  const info = normalizeErrorInfo(value);
  return Boolean(info?.runId && info.retryable && info.retryMode === 'decision_required');
}

function errorSource(value) {
  if (typeof value === 'string') return { message: value };
  if (value instanceof Error) {
    return {
      message: value.message,
      code: value.code,
      type: value.type,
      failureClass: value.failureClass,
      phase: value.phase,
      messageKey: value.messageKey,
      retryMode: value.retryMode,
      retryable: value.retryable,
      retryAfterMs: value.retryAfterMs,
      attempt: value.attempt,
      maxAttempts: value.maxAttempts,
      sideEffectState: value.sideEffectState,
      partialOutput: value.partialOutput,
      runId: value.runId,
      intentId: value.intentId,
      requestId: value.requestId,
      detail: value.detail
    };
  }
  return typeof value === 'object' ? value : null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function stringValue(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
