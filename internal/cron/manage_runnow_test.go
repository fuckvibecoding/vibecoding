package cron

import (
	"errors"
	"testing"
	"time"
)

// Coverage of the additive Phase 3 management-plane helpers: the exported
// schedule normalization, the job-scoped completion observer, and RunNow.

func TestNormalizeJobSchedule(t *testing.T) {
	job := &CronJob{Name: "n", Prompt: "p"}
	if err := NormalizeJobSchedule(job); err != nil {
		t.Fatal(err)
	}
	if job.Mode != "yolo" || !job.OneShot || !job.NextRun.IsZero() {
		t.Fatalf("empty schedule job = %#v", job)
	}

	job = &CronJob{Name: "n", Prompt: "p", Schedule: "@daily", Mode: "agent"}
	if err := NormalizeJobSchedule(job); err != nil {
		t.Fatal(err)
	}
	if job.OneShot || job.NextRun.IsZero() || job.Mode != "agent" {
		t.Fatalf("daily job = %#v", job)
	}

	job = &CronJob{Name: "n", Prompt: "p", Schedule: "@once"}
	if err := NormalizeJobSchedule(job); err != nil {
		t.Fatal(err)
	}
	if !job.OneShot || !job.NextRun.IsZero() {
		t.Fatalf("@once job = %#v", job)
	}

	if err := NormalizeJobSchedule(&CronJob{Name: "n", Prompt: "p", Mode: "turbo"}); err == nil {
		t.Fatal("invalid mode must fail")
	}
	if err := NormalizeJobSchedule(&CronJob{Name: "n", Prompt: "p", Schedule: "@every soon"}); err == nil {
		t.Fatal("invalid schedule must fail")
	}
	if err := NormalizeJobSchedule(nil); err == nil {
		t.Fatal("nil job must fail")
	}
}

func TestSchedulerRunNowExecutesAndNotifiesJobObserver(t *testing.T) {
	store := NewSQLiteCronStore(t.TempDir())
	job, err := store.Create(CronJob{
		Name: "manual", Prompt: "do it", Schedule: "", Mode: "yolo",
		Enabled: false, // only the manual trigger may run it
	})
	if err != nil {
		t.Fatal(err)
	}

	scheduler := NewScheduler(store, nil, time.Hour)
	jobEvents := make(chan CronJob, 2)
	jobErrors := make(chan error, 2)
	scheduler.SetJobCompletionObserver(func(completed CronJob, response string, runErr error) {
		jobEvents <- completed
		jobErrors <- runErr
	})
	sessionEvents := make(chan string, 2)
	scheduler.SetCompletionObserver(func(sessionID, response string, runErr error) {
		sessionEvents <- sessionID
	})

	// RunNow works without Start (no scheduler loop involved).
	if err := scheduler.RunNow(job.ID); err != nil {
		t.Fatalf("RunNow: %v", err)
	}
	select {
	case completed := <-jobEvents:
		if completed.ID != job.ID || completed.Name != "manual" {
			t.Fatalf("observed job = %#v", completed)
		}
		if runErr := <-jobErrors; runErr == nil {
			t.Fatal("nil agent manager must surface a run error")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("job observer did not fire")
	}
	select {
	case sessionID := <-sessionEvents:
		t.Fatalf("session observer must not fire for unbound jobs, got %q", sessionID)
	default:
	}

	stored, err := store.Get(job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.LastRun.IsZero() {
		t.Fatal("RunNow must stamp lastRun through the claim path")
	}
	if stored.LastStatus != "failed" || stored.RunCount != 1 || stored.LastError == "" {
		t.Fatalf("stored job after failed run = %#v", stored)
	}
	if stored.Enabled {
		t.Fatalf("one-shot job must auto-disable after the run: %#v", stored)
	}

	// A second manual run overrides the disabled one-shot.
	if err := scheduler.RunNow(job.ID); err != nil {
		t.Fatalf("second RunNow: %v", err)
	}
	select {
	case <-jobEvents:
	case <-time.After(10 * time.Second):
		t.Fatal("second job observer did not fire")
	}
	stored, err = store.Get(job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.RunCount != 2 {
		t.Fatalf("stored job after second run = %#v", stored)
	}
}

func TestSchedulerRunNowErrors(t *testing.T) {
	store := NewSQLiteCronStore(t.TempDir())
	scheduler := NewScheduler(store, nil, time.Hour)

	if err := scheduler.RunNow("missing"); err == nil {
		t.Fatal("unknown id must fail")
	}
	if err := scheduler.RunNow("  "); err == nil {
		t.Fatal("empty id must fail")
	}

	job, err := store.Create(CronJob{Name: "busy", Prompt: "p", Enabled: true, LastStatus: "running", LastRun: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	if err := scheduler.RunNow(job.ID); !errors.Is(err, ErrJobAlreadyRunning) {
		t.Fatalf("running job error = %v, want ErrJobAlreadyRunning", err)
	}

	if err := (*Scheduler)(nil).RunNow("x"); err == nil {
		t.Fatal("nil scheduler must fail safely")
	}
}
