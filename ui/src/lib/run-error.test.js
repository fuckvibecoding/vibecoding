import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canRetryError,
  errorDisplayMessage,
  normalizeErrorInfo,
  normalizeRetryInfo,
  requiresRetryConfirmation
} from './run-error.js';

test('normalizes ErrorInfo without losing Runtime retry policy', () => {
  const info = normalizeErrorInfo({
    message: 'Temporary provider failure',
    code: 'provider_unavailable',
    failureClass: 'transient',
    retryMode: 'automatic',
    retryable: true,
    retryAfterMs: 1200,
    runId: 'run_1',
    intentId: 'intent_1'
  });
  assert.equal(info.code, 'provider_unavailable');
  assert.equal(info.failureClass, 'transient');
  assert.equal(info.retryAfterMs, 1200);
  assert.equal(info.runId, 'run_1');
  assert.equal(canRetryError(info), true);
  assert.equal(errorDisplayMessage(info, (key) => key), 'Temporary provider failure');
});

test('shows provider diagnostic alongside localized failure category', () => {
  const info = normalizeErrorInfo({
    message: 'API error 503: upstream overloaded',
    detail: 'API error 503: upstream overloaded',
    messageKey: 'run.error.providerUnavailable'
  });
  assert.equal(
    errorDisplayMessage(info, (key) => key === 'run.error.providerUnavailable' ? 'Model service unavailable' : key),
    'API error 503: upstream overloaded'
  );

  info.detail = 'API error 503: request_id=req_123';
  assert.equal(
    errorDisplayMessage(info, (key) => key === 'run.error.providerUnavailable' ? 'Model service unavailable' : key),
    'Model service unavailable: API error 503: request_id=req_123'
  );
});

test('decision-required retry remains a separate explicit confirmation action', () => {
  const info = normalizeErrorInfo({
    message: 'Confirmation required',
    retryMode: 'decision_required',
    retryable: true,
    runId: 'run_2'
  });
  assert.equal(canRetryError(info), false);
  assert.equal(requiresRetryConfirmation(info), true);
});

test('normalizes the flat run_retrying data contract', () => {
  const retry = normalizeRetryInfo({
    state: 'retrying',
    attempt: 2,
    maxAttempts: 3,
    phase: 'model',
    reasonCode: 'provider_timeout',
    retryAfterMs: 500,
    message: 'service unavailable (HTTP 503)'
  });
  assert.equal(retry.state, 'retrying');
  assert.equal(retry.attempt, 2);
  assert.equal(retry.maxAttempts, 3);
  assert.equal(retry.reasonCode, 'provider_timeout');
  // The sanitized provider diagnostic survives normalization so the chat
  // view can append it after the friendly retry label.
  assert.equal(retry.message, 'service unavailable (HTTP 503)');
});
