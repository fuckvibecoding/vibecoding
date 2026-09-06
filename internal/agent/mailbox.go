package agent

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/startvibecoding/mothx/internal/provider"
)

// Member completion statuses carried by MemberCompletion.Status. They match
// the terminal managed-agent states so adapters can project them uniformly.
const (
	MemberStatusDone       = "done"
	MemberStatusError      = "error"
	MemberStatusCanceled   = "canceled"
	MemberStatusIncomplete = "incomplete"
)

// Rune budgets for the steering-injected completion payload. Error payloads
// use a smaller budget to reserve room for the appended next-step hint.
const (
	memberPayloadRunes      = 3500
	memberErrorPayloadRunes = 3000
	memberTruncationSuffix  = "…[truncated]"
)

// MemberCompletion is one terminal member notification queued in a
// MemberMailbox. Payload carries the final response (done) or the error text
// (error/canceled/incomplete).
type MemberCompletion struct {
	MemberID    string
	DisplayName string
	Status      string // "done" | "error" | "canceled" | "incomplete"
	Payload     string // final result or error explanation
}

// MemberMailbox is the session-level in-memory queue of member completions.
// The runtime drains it at agent-loop iteration boundaries through
// DrainSteering (composed into GetSteeringMessages by the runtime assembly
// layer); subagent_wait merges a blocked lead into activity through
// WaitForActivity. A mailbox never wakes or starts a run by itself.
// The zero value is not usable; create one with NewMemberMailbox. All methods
// are safe on a nil mailbox so callers can skip nil checks at use sites.
type MemberMailbox struct {
	mu       sync.Mutex
	queue    []MemberCompletion
	activity chan struct{} // capacity 1, non-blocking wakeup hint
}

// NewMemberMailbox creates an empty mailbox.
func NewMemberMailbox() *MemberMailbox {
	return &MemberMailbox{activity: make(chan struct{}, 1)}
}

// Enqueue appends a completion to the queue and non-blockingly signals
// activity so a waiting subagent_wait returns promptly.
func (m *MemberMailbox) Enqueue(c MemberCompletion) {
	if m == nil {
		return
	}
	m.mu.Lock()
	m.queue = append(m.queue, c)
	m.mu.Unlock()
	select {
	case m.activity <- struct{}{}:
	default:
	}
}

// HasPending reports whether undelivered completions are queued.
func (m *MemberMailbox) HasPending() bool {
	if m == nil {
		return false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.queue) > 0
}

// DrainSteering removes and returns every queued completion in enqueue order,
// formatted as system-injected steering messages (one per completion). It
// returns nil when nothing is pending. The activity hint is drained alongside
// the queue so a later WaitForActivity does not return on a stale signal.
func (m *MemberMailbox) DrainSteering() []provider.Message {
	if m == nil {
		return nil
	}
	m.mu.Lock()
	pending := m.queue
	m.queue = nil
	m.mu.Unlock()
	select {
	case <-m.activity:
	default:
	}
	if len(pending) == 0 {
		return nil
	}
	messages := make([]provider.Message, 0, len(pending))
	for _, c := range pending {
		messages = append(messages, provider.NewSystemInjectedUserMessage(formatMemberCompletion(c)))
	}
	return messages
}

// PendingSummary returns a read-only snapshot of the queued completions
// without removing them. subagent_wait uses it for its pending list; content
// delivery stays exclusively with DrainSteering.
func (m *MemberMailbox) PendingSummary() []MemberCompletion {
	if m == nil {
		return nil
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.queue) == 0 {
		return nil
	}
	out := make([]MemberCompletion, len(m.queue))
	copy(out, m.queue)
	return out
}

// WaitForActivity blocks until the mailbox signals activity, the timeout
// elapses (timedOut=true, err=nil), or ctx is done (err wraps ctx.Err).
func (m *MemberMailbox) WaitForActivity(ctx context.Context, timeout time.Duration) (bool, error) {
	if m == nil {
		return false, errors.New("member mailbox is not initialized")
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false, fmt.Errorf("wait for member activity: %w", ctx.Err())
	case <-timer.C:
		return true, nil
	case <-m.activity:
		return false, nil
	}
}

// formatMemberCompletion renders one completion as the machine-readable
// steering envelope. The [MEMBER_COMPLETION] marker keeps the injection
// identifiable as system-provided member state context; it never impersonates
// user intent.
func formatMemberCompletion(c MemberCompletion) string {
	var b strings.Builder
	b.WriteString("[MEMBER_COMPLETION] 系统注入的成员状态上下文（非用户输入）。\n")
	if c.DisplayName != "" {
		fmt.Fprintf(&b, "member: %s（%s）\n", c.MemberID, c.DisplayName)
	} else {
		fmt.Fprintf(&b, "member: %s\n", c.MemberID)
	}
	fmt.Fprintf(&b, "status: %s\n", c.Status)
	b.WriteString("payload:\n")
	if c.Status == MemberStatusError {
		b.WriteString(truncateMemberPayload(c.Payload, memberErrorPayloadRunes))
		b.WriteString("\n")
		fmt.Fprintf(&b, "下一步：如仍需该成员，用 subagent_spawn(member:%q, task:…) 重新派发任务。", c.MemberID)
	} else {
		b.WriteString(truncateMemberPayload(c.Payload, memberPayloadRunes))
	}
	return b.String()
}

// truncateMemberPayload truncates s to at most limit runes, marking the cut
// with the truncation suffix.
func truncateMemberPayload(s string, limit int) string {
	runes := []rune(s)
	if len(runes) <= limit {
		return s
	}
	return string(runes[:limit]) + memberTruncationSuffix
}
