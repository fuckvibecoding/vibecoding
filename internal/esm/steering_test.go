package esm

import (
	"context"
	"strings"
	"testing"
)

func TestSteeringSourceInjectsEachActiveObjectiveVersionOnce(t *testing.T) {
	store, sessionID := newTestStore(t)
	source := NewSteeringSource(store, sessionID)
	if messages := source.Next(); len(messages) != 0 {
		t.Fatalf("missing objective steering = %#v, want none", messages)
	}

	if _, err := store.Create(context.Background(), sessionID, "finish the first objective"); err != nil {
		t.Fatal(err)
	}
	messages := source.Next()
	if len(messages) != 1 || !messages[0].SystemInjected || !strings.Contains(messages[0].Content, "finish the first objective") {
		t.Fatalf("initial steering = %#v", messages)
	}
	if messages := source.Next(); len(messages) != 0 {
		t.Fatalf("duplicate initial steering = %#v, want none", messages)
	}

	if _, err := store.Edit(context.Background(), sessionID, "finish the revised objective"); err != nil {
		t.Fatal(err)
	}
	messages = source.Next()
	if len(messages) != 1 || !strings.Contains(messages[0].Content, "finish the revised objective") {
		t.Fatalf("revised steering = %#v", messages)
	}
	if messages := source.Next(); len(messages) != 0 {
		t.Fatalf("duplicate revised steering = %#v, want none", messages)
	}
}

func TestSteeringSourceSkipsPausedObjectiveUntilResumed(t *testing.T) {
	store, sessionID := newTestStore(t)
	if _, err := store.Create(context.Background(), sessionID, "finish the objective"); err != nil {
		t.Fatal(err)
	}
	source := NewSteeringSource(store, sessionID)
	if messages := source.Next(); len(messages) != 1 {
		t.Fatalf("active steering = %#v, want one message", messages)
	}
	if _, err := store.Pause(context.Background(), sessionID); err != nil {
		t.Fatal(err)
	}
	if messages := source.Next(); len(messages) != 0 {
		t.Fatalf("paused steering = %#v, want none", messages)
	}
	if _, err := store.Resume(context.Background(), sessionID); err != nil {
		t.Fatal(err)
	}
	if messages := source.Next(); len(messages) != 1 {
		t.Fatalf("resumed steering = %#v, want one message", messages)
	}
}
