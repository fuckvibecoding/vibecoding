package cron

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ParseSchedule parses a human-readable schedule string into a next-run time.
// Supported formats:
//
//	""           → one-shot (no next run)
//	"@once"      → one-shot (same as empty)
//	"@every 30m" → every 30 minutes
//	"@every 2h"  → every 2 hours
//	"@every 1d"  → every 1 day
//	"@hourly"    → every 1 hour
//	"@daily"     → every 24 hours (midnight)
//	"@weekly"    → every 7 days
//	"@monthly"   → 1st of next month
func ParseSchedule(schedule string, from time.Time) (next time.Time, isOneShot bool, err error) {
	schedule = strings.TrimSpace(schedule)

	// Empty or @once → one-shot
	if schedule == "" || schedule == "@once" {
		return time.Time{}, true, nil
	}

	// @every Xm / Xh / Xd
	if strings.HasPrefix(schedule, "@every ") {
		dur, err := parseDuration(strings.TrimPrefix(schedule, "@every "))
		if err != nil {
			return time.Time{}, false, fmt.Errorf("invalid @every duration: %w", err)
		}
		if dur <= 0 {
			return time.Time{}, false, fmt.Errorf("@every duration must be positive")
		}
		return from.Add(dur), false, nil
	}

	// Named schedules
	switch strings.ToLower(schedule) {
	case "@hourly":
		return from.Add(time.Hour), false, nil
	case "@daily":
		// Next midnight
		y, m, d := from.Date()
		next = time.Date(y, m, d+1, 0, 0, 0, 0, from.Location())
		return next, false, nil
	case "@weekly":
		// Next Monday midnight
		y, m, d := from.Date()
		daysUntilMon := (8 - int(from.Weekday())) % 7
		if daysUntilMon == 0 {
			daysUntilMon = 7
		}
		next = time.Date(y, m, d+daysUntilMon, 0, 0, 0, 0, from.Location())
		return next, false, nil
	case "@monthly":
		// Next 1st of month
		y, m, _ := from.Date()
		next = time.Date(y, m+1, 1, 0, 0, 0, 0, from.Location())
		return next, false, nil
	}

	// Try standard 5-field cron: min hour day month weekday
	parts := strings.Fields(schedule)
	if len(parts) == 5 {
		return parseCronExpr(parts, from)
	}

	return time.Time{}, false, fmt.Errorf("unsupported schedule format: %q (use @every Xm, @hourly, @daily, @weekly, @monthly, or 5-field cron)", schedule)
}

// parseDuration parses "30m", "2h", "1d" into time.Duration.
func parseDuration(s string) (time.Duration, error) {
	if strings.HasSuffix(s, "d") {
		n, err := strconv.Atoi(strings.TrimSuffix(s, "d"))
		if err != nil {
			return 0, err
		}
		return time.Duration(n) * 24 * time.Hour, nil
	}
	return time.ParseDuration(s)
}

// parseCronExpr handles standard five-field cron expressions. Fields support
// exact values, */N steps, comma-separated values, and inclusive ranges.
func parseCronExpr(fields []string, from time.Time) (time.Time, bool, error) {
	ranges := [][2]int{{0, 59}, {0, 23}, {1, 31}, {1, 12}, {0, 7}}
	sets := make([][]bool, len(fields))
	for i, field := range fields {
		values, err := parseCronField(field, ranges[i][0], ranges[i][1])
		if err != nil {
			return time.Time{}, false, fmt.Errorf("invalid cron field %d (%q): %w", i+1, field, err)
		}
		if i == 4 {
			// Cron accepts both 0 and 7 for Sunday.
			values[0] = values[0] || values[7]
			values[7] = values[0]
		}
		sets[i] = values
	}

	// Cron schedules operate on minute boundaries. Search a bounded horizon so
	// impossible dates (for example 31 February) return a validation error.
	next := from.Truncate(time.Minute).Add(time.Minute)
	const maxMinutes = 5 * 366 * 24 * 60
	for i := 0; i < maxMinutes; i++ {
		month := int(next.Month())
		weekday := int(next.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		dayMatches := sets[2][next.Day()] && sets[3][month]
		weekdayMatches := sets[4][weekday]
		// When both day-of-month and weekday are restricted, cron uses OR;
		// if either is wildcard, both conditions reduce to the normal AND.
		dayWildcard := cronFieldIsWildcard(fields[2])
		weekdayWildcard := cronFieldIsWildcard(fields[4])
		dayOK := dayMatches && weekdayMatches
		if !dayWildcard && !weekdayWildcard {
			dayOK = (sets[2][next.Day()] && sets[3][month]) || weekdayMatches
		} else if dayWildcard {
			dayOK = weekdayMatches && sets[3][month]
		} else if weekdayWildcard {
			dayOK = dayMatches
		}
		if sets[0][next.Minute()] && sets[1][next.Hour()] && dayOK {
			return next, false, nil
		}
		next = next.Add(time.Minute)
	}
	return time.Time{}, false, fmt.Errorf("cron expression has no occurrence within five years")
}

func parseCronField(field string, min, max int) ([]bool, error) {
	values := make([]bool, max+1)
	for _, item := range strings.Split(strings.TrimSpace(field), ",") {
		if item == "" {
			return nil, fmt.Errorf("empty value")
		}
		base, step := item, 1
		if strings.Contains(item, "/") {
			parts := strings.Split(item, "/")
			if len(parts) != 2 || parts[1] == "" {
				return nil, fmt.Errorf("invalid step")
			}
			var err error
			step, err = strconv.Atoi(parts[1])
			if err != nil || step <= 0 {
				return nil, fmt.Errorf("step must be positive")
			}
			base = parts[0]
		}
		lo, hi := min, max
		switch {
		case base == "*":
		case strings.Contains(base, "-"):
			parts := strings.Split(base, "-")
			if len(parts) != 2 {
				return nil, fmt.Errorf("invalid range")
			}
			var err error
			lo, err = strconv.Atoi(parts[0])
			if err != nil {
				return nil, fmt.Errorf("invalid range")
			}
			hi, err = strconv.Atoi(parts[1])
			if err != nil {
				return nil, fmt.Errorf("invalid range")
			}
		default:
			var err error
			lo, err = strconv.Atoi(base)
			if err != nil {
				return nil, fmt.Errorf("invalid value")
			}
			hi = lo
		}
		if lo < min || hi > max || lo > hi {
			return nil, fmt.Errorf("value out of range %d-%d", min, max)
		}
		for value := lo; value <= hi; value += step {
			values[value] = true
		}
	}
	return values, nil
}

func cronFieldIsWildcard(field string) bool {
	field = strings.TrimSpace(field)
	return field == "*"
}

// NormalizeJobSchedule validates a job's mode and schedule and computes its
// NextRun. It is the canonical normalization for management surfaces that
// create or update jobs: an empty mode defaults to yolo, only agent/yolo are
// accepted, and an empty (or @once) schedule marks the job one-shot with no
// next run.
func NormalizeJobSchedule(job *CronJob) error {
	if job == nil {
		return fmt.Errorf("cron job required")
	}
	if job.Mode == "" {
		job.Mode = "yolo"
	}
	if job.Mode != "agent" && job.Mode != "yolo" {
		return fmt.Errorf("mode must be agent or yolo")
	}

	next, isOneShot, err := ParseSchedule(job.Schedule, time.Now())
	if err != nil {
		return err
	}
	if job.OneShot || isOneShot {
		job.OneShot = true
		job.NextRun = time.Time{}
		return nil
	}
	job.NextRun = next
	return nil
}
