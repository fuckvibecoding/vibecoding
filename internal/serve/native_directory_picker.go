package serve

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

var errNativeDirectoryPickerUnavailable = errors.New("native directory picker is unavailable")

// openNativeDirectoryPicker delegates directory selection to the operating
// system. For a local Web UI this opens the picker on the same machine as the
// browser, while keeping the selection behavior consistent with Electron.
func openNativeDirectoryPicker(ctx context.Context, defaultPath string) (string, error) {
	defaultPath = filepath.Clean(defaultPath)
	switch runtime.GOOS {
	case "darwin":
		return openDarwinDirectoryPicker(ctx, defaultPath)
	case "windows":
		return openWindowsDirectoryPicker(ctx, defaultPath)
	case "linux", "freebsd", "openbsd", "netbsd":
		return openUnixDirectoryPicker(ctx, defaultPath)
	default:
		return "", errNativeDirectoryPickerUnavailable
	}
}

func openUnixDirectoryPicker(ctx context.Context, defaultPath string) (string, error) {
	// Native dialogs require a graphical session. On headless servers the
	// picker can never open (and a failed launch is indistinguishable from a
	// cancel), so report it as unavailable and let the Web UI fall back to
	// its built-in directory browser.
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		return "", errNativeDirectoryPickerUnavailable
	}
	filename := defaultPath
	if filename != string(filepath.Separator) && !strings.HasSuffix(filename, string(filepath.Separator)) {
		filename += string(filepath.Separator)
	}
	commands := []struct {
		name string
		args []string
	}{
		{name: "zenity", args: []string{"--file-selection", "--directory", "--title=Select working directory", "--filename=" + filename}},
		{name: "kdialog", args: []string{"--getexistingdirectory", defaultPath, "--title", "Select working directory"}},
		{name: "yad", args: []string{"--file-selection", "--directory", "--title=Select working directory", "--filename=" + filename}},
	}
	for _, candidate := range commands {
		if _, err := exec.LookPath(candidate.name); err != nil {
			continue
		}
		return runDirectoryPicker(ctx, candidate.name, candidate.args...)
	}
	return "", errNativeDirectoryPickerUnavailable
}

func openDarwinDirectoryPicker(ctx context.Context, defaultPath string) (string, error) {
	script := fmt.Sprintf(`try
  set selectedFolder to choose folder with prompt "Select working directory" default location POSIX file "%s"
  return POSIX path of selectedFolder
on error number -128
  return ""
end try`, appleScriptString(defaultPath))
	if _, err := exec.LookPath("osascript"); err != nil {
		return "", errNativeDirectoryPickerUnavailable
	}
	return runDirectoryPicker(ctx, "osascript", "-e", script)
}

// windowsDirectoryPickerScript renders the folder picker and writes the
// selection to stdout. Windows PowerShell 5.1 encodes redirected stdout with
// the ANSI/OEM code page (for example GBK on Chinese systems), which corrupts
// non-ASCII paths such as Chinese or full-width directory names; the Go side
// always reads the output as UTF-8, so force UTF-8 first. pwsh 7 already
// defaults to UTF-8 for redirected output, and the explicit assignment keeps
// both hosts identical. The default path is passed through an environment
// variable because the process environment block is UTF-16 on Windows.
const windowsDirectoryPickerScript = `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select working directory'
$dialog.SelectedPath = $env:MOTHX_DIRECTORY_PICKER_PATH
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath) }`

func openWindowsDirectoryPicker(ctx context.Context, defaultPath string) (string, error) {
	for _, name := range []string{"powershell.exe", "pwsh.exe"} {
		if _, err := exec.LookPath(name); err != nil {
			continue
		}
		cmd := exec.CommandContext(ctx, name, "-NoProfile", "-NonInteractive", "-STA", "-Command", "Add-Type -AssemblyName System.Windows.Forms; "+windowsDirectoryPickerScript)
		cmd.Env = append(os.Environ(), "MOTHX_DIRECTORY_PICKER_PATH="+defaultPath)
		return runDirectoryPickerCommand(ctx, cmd)
	}
	return "", errNativeDirectoryPickerUnavailable
}

func runDirectoryPicker(ctx context.Context, name string, args ...string) (string, error) {
	return runDirectoryPickerCommand(ctx, exec.CommandContext(ctx, name, args...))
}

func runDirectoryPickerCommand(ctx context.Context, cmd *exec.Cmd) (string, error) {
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return "", ctxErr
		}
		// Native pickers use a non-zero exit status for an ordinary cancel,
		// which stays silent. Launch failures (for example a missing
		// graphical session) print diagnostics on stderr, so they surface as
		// errors instead of being mistaken for a cancel.
		if _, ok := err.(*exec.ExitError); ok && strings.TrimSpace(stdout.String()) == "" && strings.TrimSpace(stderr.String()) == "" {
			return "", nil
		}
		return "", fmt.Errorf("native directory picker: %w", err)
	}
	// Strip only the trailing newline that picker tools append. Trimming all
	// Unicode whitespace would corrupt legitimate directory names that start
	// or end with a space or a full-width space (U+3000), which NTFS and Unix
	// filesystems both allow.
	return strings.TrimRight(stdout.String(), "\r\n"), nil
}

func appleScriptString(value string) string {
	return strings.NewReplacer(
		`\`, `\\`,
		`"`, `\"`,
		"\r", `\r`,
		"\n", `\n`,
	).Replace(value)
}
