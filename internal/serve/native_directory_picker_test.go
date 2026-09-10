package serve

import (
	"context"
	"os/exec"
	"runtime"
	"strings"
	"testing"
)

// The Windows picker must force UTF-8 stdout. Windows PowerShell 5.1
// otherwise encodes redirected output with the ANSI/OEM code page, so a
// selected Chinese or full-width directory name reaches Go as invalid UTF-8
// and the path is corrupted.
func TestWindowsDirectoryPickerScriptForcesUTF8Output(t *testing.T) {
	script := windowsDirectoryPickerScript
	encIdx := strings.Index(script, "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)")
	if encIdx == -1 {
		t.Fatal("script must set UTF-8 console output encoding before writing the selection")
	}
	writeIdx := strings.Index(script, "[Console]::Write($dialog.SelectedPath)")
	if writeIdx == -1 {
		t.Fatal("script must write the selected path with [Console]::Write")
	}
	if encIdx > writeIdx {
		t.Fatal("UTF-8 output encoding must be set before the selection is written")
	}
	if !strings.Contains(script, "$env:MOTHX_DIRECTORY_PICKER_PATH") {
		t.Fatal("default path must arrive through the UTF-16 environment block, not the command line")
	}
}

// runDirectoryPickerCommand may only strip the trailing newline that picker
// tools append. Directory names on Windows and Unix can legitimately contain
// (and on Unix start/end with) spaces or full-width characters such as U+3000;
// Unicode-aware trimming would silently alter the selected path.
func TestRunDirectoryPickerCommandKeepsNonASCIIPathBytes(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("printf helper is not available on windows")
	}
	const want = `D:\项目　目录　`
	cmd := exec.Command("printf", "%s\n", want)
	got, err := runDirectoryPickerCommand(context.Background(), cmd)
	if err != nil {
		t.Fatalf("run picker command: %v", err)
	}
	if got != want {
		t.Fatalf("picker output = %q, want %q (trailing full-width space must survive)", got, want)
	}
}
