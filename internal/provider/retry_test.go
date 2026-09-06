package provider

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestIsRetryable_NetworkErrors(t *testing.T) {
	tests := []struct {
		name string
		err  error
		code int
		want bool
	}{
		{"nil error", nil, 0, false},
		{"429", nil, http.StatusTooManyRequests, true},
		{"502", nil, http.StatusBadGateway, true},
		{"503", nil, http.StatusServiceUnavailable, true},
		{"504", nil, http.StatusGatewayTimeout, true},
		{"524", nil, httpStatusOriginTimeout, true},
		{"500", nil, http.StatusInternalServerError, true},
		{"400 retryable", nil, http.StatusBadRequest, true},
		{"401 retryable", nil, http.StatusUnauthorized, true},
		{"499 retryable", nil, 499, true},
		{"599 retryable", nil, 599, true},
		{"ECONNRESET", syscall.ECONNRESET, 0, true},
		// A peer can reset an already established streaming connection after
		// the HTTP request succeeds. net/http surfaces that read failure with
		// this text when there is no directly inspectable syscall wrapper.
		{"stream read connection reset by peer", errors.New("stream read error: read tcp 192.168.1.143:44252->180.76.199.86:443: read: connection reset by peer"), 0, true},
		{"ECONNREFUSED", syscall.ECONNREFUSED, 0, true},
		{"EPIPE", syscall.EPIPE, 0, true},
		{"ETIMEDOUT", syscall.ETIMEDOUT, 0, true},
		{"HTTP/2 stream internal error", fmt.Errorf("stream error: stream ID 19; INTERNAL_ERROR; received from peer"), 0, true},
		{"Responses stream read error", errors.New("responses error: stream_read_error"), 0, true},
		{"Responses generic stream failure", errors.New("responses stream failed"), 0, true},
		{"Responses server error", errors.New("responses error: server_error"), 0, true},
		{"Responses rate limit", errors.New("responses error: rate_limit_exceeded"), 0, true},
		{"Responses context overflow not retryable", errors.New("responses error: maximum context length exceeded"), 0, false},
		{"Responses server overloaded", errors.New("responses error: Our servers are currently overloaded. Please try again later."), 0, true},
		{"SSE HTTP 502 error", errors.New("upstream returned HTTP 502"), 0, true},
		{"SSE HTTP 503 error", errors.New("upstream returned HTTP 503"), 0, true},
		{"SSE HTTP 400 error", errors.New("upstream returned HTTP 400"), 0, true},
		{"unexpected EOF", io.ErrUnexpectedEOF, 0, true},
		{"wrapped unexpected EOF", fmt.Errorf("stream read error: %w", io.ErrUnexpectedEOF), 0, true}, {"SSE HTTP 524 error", errors.New("upstream returned HTTP 524"), 0, true},
		{"context canceled", context.Canceled, 0, false},
		{"generic error", errors.New("something"), 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsRetryable(tt.err, tt.code)
			if got != tt.want {
				t.Errorf("IsRetryable(%v, %d) = %v, want %v", tt.err, tt.code, got, tt.want)
			}
		})
	}
}

func TestRetryDelay_ExponentialBackoff(t *testing.T) {
	base := 2000

	d0 := RetryDelay(0, base)
	d1 := RetryDelay(1, base)
	d2 := RetryDelay(2, base)

	if d0 != 2000*time.Millisecond {
		t.Errorf("delay(0) = %v, want 2s", d0)
	}
	if d1 != 4000*time.Millisecond {
		t.Errorf("delay(1) = %v, want 4s", d1)
	}
	if d2 != 8000*time.Millisecond {
		t.Errorf("delay(2) = %v, want 8s", d2)
	}
}

func TestRetryDelay_CappedAt30s(t *testing.T) {
	d := RetryDelay(10, 5000)
	if d > 30*time.Second {
		t.Errorf("delay(10, 5000) = %v, want <= 30s", d)
	}
}

func TestRetryDelay_DefaultBase(t *testing.T) {
	d := RetryDelay(0, 0) // baseDelayMs <= 0 defaults to 2000
	if d != 2000*time.Millisecond {
		t.Errorf("delay(0, 0) = %v, want 2s", d)
	}
}

func TestFormatRetryMessage_Timeout(t *testing.T) {
	msg := FormatRetryMessage(0, 3, 2*time.Second, fmt.Errorf("context deadline exceeded"))
	if msg == "" {
		t.Error("expected non-empty message")
	}
	t.Logf("timeout: %s", msg)
}

func TestFormatRetryMessage_ServerOverloaded(t *testing.T) {
	msg := FormatRetryMessage(0, 3, 2*time.Second, errors.New("responses error: Our servers are currently overloaded"))
	if !strings.Contains(msg, "server overloaded") {
		t.Fatalf("message = %q, want overloaded classification", msg)
	}
}

func TestFormatRetryMessage_RateLimited(t *testing.T) {
	msg := FormatRetryMessage(1, 3, 4*time.Second, fmt.Errorf("HTTP 429: rate limit"))
	if msg == "" {
		t.Error("expected non-empty message")
	}
	t.Logf("rate limited: %s", msg)
}

func TestFormatRetryMessage_ConnectionRefused(t *testing.T) {
	msg := FormatRetryMessage(2, 3, 8*time.Second, fmt.Errorf("connection refused"))
	if msg == "" {
		t.Error("expected non-empty message")
	}
	t.Logf("conn refused: %s", msg)
}

func TestFormatRetryMessage_Generic(t *testing.T) {
	msg := FormatRetryMessage(0, 3, 2*time.Second, fmt.Errorf("some random error"))
	if msg == "" {
		t.Error("expected non-empty message")
	}
	t.Logf("generic: %s", msg)
}

func TestFormatRetryMessage_StreamReadError(t *testing.T) {
	msg := FormatRetryMessage(0, 3, time.Second, errors.New("responses error: stream_read_error"))
	if !strings.Contains(msg, "upstream stream read error") {
		t.Fatalf("message = %q, want stream read classification", msg)
	}
}

func TestFormatRetryMessage_OriginTimeout(t *testing.T) {
	msg := FormatRetryMessage(0, 3, time.Second, errors.New("HTTP 524: origin timeout"))
	if !strings.Contains(msg, "origin timeout (HTTP 524)") {
		t.Fatalf("message = %q, want origin timeout classification", msg)
	}
}

func TestFormatRetryMessage_JSONErrorMessage(t *testing.T) {
	// Test OpenAI-style error response
	openAIError := errors.New(`HTTP 400: {"object":"error","message":"\"auto\" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set","type":"BadRequestError","param":null,"code":400}`)
	msg := FormatRetryMessage(0, 3, time.Second, openAIError)
	if !strings.Contains(msg, `"auto" tool choice requires --enable-auto-tool-choice`) {
		t.Fatalf("message = %q, want extracted JSON error message", msg)
	}
	if !strings.Contains(msg, "Retrying (1/3)") {
		t.Fatalf("message = %q, want retry prefix", msg)
	}
}

func TestFormatRetryMessage_JSONErrorNested(t *testing.T) {
	// Test nested error.message format (some providers use this)
	nestedError := errors.New(`HTTP 400: {"error":{"message":"Invalid API key provided"},"code":400}`)
	msg := FormatRetryMessage(0, 3, time.Second, nestedError)
	if !strings.Contains(msg, "Invalid API key provided") {
		t.Fatalf("message = %q, want extracted nested error.message", msg)
	}
}

func TestFormatRetryMessage_JSONErrorInvalid(t *testing.T) {
	// Test that invalid JSON falls back to default behavior
	invalidJSON := errors.New("HTTP 400: not valid json {")
	msg := FormatRetryMessage(0, 3, time.Second, invalidJSON)
	// Should fall back to the generic error format
	if !strings.Contains(msg, "error:") {
		t.Fatalf("message = %q, want fallback error format", msg)
	}
}

func TestRetryErrorDetail(t *testing.T) {
	// A nil error yields no detail.
	if got := RetryErrorDetail(nil); got != "" {
		t.Fatalf("detail = %q, want empty for nil error", got)
	}

	// JSON payloads are extracted without the retry wrapper.
	openAIError := errors.New(`HTTP 400: {"error":{"message":"\"auto\" tool choice requires --enable-auto-tool-choice"},"code":400}`)
	if got := RetryErrorDetail(openAIError); got != `"auto" tool choice requires --enable-auto-tool-choice` {
		t.Fatalf("detail = %q, want extracted JSON message only", got)
	}

	// Known failures classify into stable friendly reasons.
	if got := RetryErrorDetail(errors.New("HTTP 503 from upstream")); got != "service unavailable (HTTP 503)" {
		t.Fatalf("detail = %q, want classified reason", got)
	}

	// Multi-line raw errors collapse into one bounded line.
	raw := errors.New("boom\n\tat layer 1\r\n at layer 2")
	got := RetryErrorDetail(raw)
	if strings.ContainsAny(got, "\n\r\t") {
		t.Fatalf("detail = %q, want single-line output", got)
	}
	if !strings.Contains(got, "boom at layer 1 at layer 2") {
		t.Fatalf("detail = %q, want collapsed whitespace", got)
	}
}

func TestTruncateErrRuneSafe(t *testing.T) {
	// Truncation must not split multi-byte runes.
	s := strings.Repeat("错", 100) // 300 bytes
	got := truncateErr(s, 50)
	if len(got) > 50 {
		t.Fatalf("truncated length = %d, want <= 50", len(got))
	}
	if !strings.HasSuffix(got, "...") {
		t.Fatalf("truncated = %q, want ellipsis suffix", got)
	}
	body := strings.TrimSuffix(got, "...")
	for _, r := range body {
		if r != '错' {
			t.Fatalf("truncated body contains broken rune %q", r)
		}
	}
}
