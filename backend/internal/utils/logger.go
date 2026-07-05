package utils

import (
	"context"
	"fmt"
	"io"
	"log"
	"log/slog"
	"os"
	"runtime"
	"strings"
)

// Package-level logger
var projectLogger *slog.Logger

// Log levels
const (
	LevelDebug = "debug"
	LevelInfo  = "info"
	LevelWarn  = "warn"
	LevelError = "error"
)

// InitLogger initializes the project logger with the given level.
// Call once at startup from main.go.
func InitLogger(level string) {
	var l slog.Level
	switch strings.ToLower(level) {
	case LevelDebug:
		l = slog.LevelDebug
	case LevelInfo:
		l = slog.LevelInfo
	case LevelWarn:
		l = slog.LevelWarn
	case LevelError:
		l = slog.LevelError
	default:
		l = slog.LevelInfo
	}

	opts := &slog.HandlerOptions{
		Level: l,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			// Remove time (we add our own format)
			if a.Key == slog.TimeKey {
				return slog.Attr{}
			}
			return a
		},
	}

	handler := NewPrettyHandler(os.Stdout, opts)
	projectLogger = slog.New(handler)
	slog.SetDefault(projectLogger)
}

// L returns the project logger. Initializes with info level if not yet initialized.
func L() *slog.Logger {
	if projectLogger == nil {
		InitLogger("info")
	}
	return projectLogger
}

// prettyHandler is a custom handler that outputs readable colored text
type prettyHandler struct {
	opts  slog.HandlerOptions
	attrs []slog.Attr
	w     io.Writer
}

func NewPrettyHandler(w io.Writer, opts *slog.HandlerOptions) slog.Handler {
	if opts == nil {
		opts = &slog.HandlerOptions{}
	}
	return &prettyHandler{
		w:    w,
		opts: *opts,
	}
}

func (h *prettyHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return level >= h.opts.Level.Level()
}

func (h *prettyHandler) Handle(ctx context.Context, r slog.Record) error {
	// Format: 2026/07/06 12:34:56 [LEVEL] message key=value
	timeStr := r.Time.Format("2006/01/02 15:04:05")
	levelStr := levelToString(r.Level)

	// Build message
	buf := make([]byte, 0, 256)
	buf = fmt.Appendf(buf, "%s %s %s", timeStr, levelStr, r.Message)

	r.Attrs(func(a slog.Attr) bool {
		buf = fmt.Appendf(buf, " %s=%v", a.Key, a.Value.Any())
		return true
	})

	// Add stored attrs
	for _, a := range h.attrs {
		buf = fmt.Appendf(buf, " %s=%v", a.Key, a.Value.Any())
	}

	buf = append(buf, '\n')

	_, err := h.w.Write(buf)
	return err
}

func (h *prettyHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &prettyHandler{
		w:     h.w,
		opts:  h.opts,
		attrs: append(h.attrs, attrs...),
	}
}

func (h *prettyHandler) WithGroup(name string) slog.Handler {
	return h // groups not needed
}

func levelToString(l slog.Level) string {
	switch l {
	case slog.LevelDebug:
		return "[DEBUG ]"
	case slog.LevelInfo:
		return "[INFO  ]"
	case slog.LevelWarn:
		return "[WARN  ]"
	case slog.LevelError:
		return "[ERROR ]"
	default:
		return "[      ]"
	}
}

// Convenience wrapper: sets source info automatically

func LogDebug(msg string, args ...interface{}) {
	L().LogAttrs(context.Background(), slog.LevelDebug, msg, argsToAttrs(args)...)
}

func LogInfo(msg string, args ...interface{}) {
	L().LogAttrs(context.Background(), slog.LevelInfo, msg, argsToAttrs(args)...)
}

func LogWarn(msg string, args ...interface{}) {
	L().LogAttrs(context.Background(), slog.LevelWarn, msg, argsToAttrs(args)...)
}

func LogError(msg string, args ...interface{}) {
	L().LogAttrs(context.Background(), slog.LevelError, msg, argsToAttrs(args)...)
}

// LogErrorWithStack logs an error with stack trace
func LogErrorWithStack(err error, msg string, args ...interface{}) {
	// Capture stack
	stack := make([]byte, 4096)
	n := runtime.Stack(stack, false)
	allArgs := append(args, "error", err, "stack", string(stack[:n]))
	L().LogAttrs(context.Background(), slog.LevelError, msg, argsToAttrs(allArgs)...)
}

// SetAsDefault redirects the standard log package to our logger
func SetDefaultLogger() {
	log.SetOutput(&logBridge{})
	log.SetFlags(0)
}

// logBridge bridges standard log to slog
type logBridge struct{}

func (l *logBridge) Write(p []byte) (n int, err error) {
	msg := strings.TrimRight(string(p), "\n")
	L().LogAttrs(context.Background(), slog.LevelInfo, msg)
	return len(p), nil
}

// InitLogging initializes everything needed for logging
func InitLogging(level string) {
	InitLogger(level)
	SetDefaultLogger()
}

// Helper to convert alternating key-value args to slog.Attr
func argsToAttrs(args []interface{}) []slog.Attr {
	if len(args) == 0 {
		return nil
	}
	attrs := make([]slog.Attr, 0, len(args)/2)
	for i := 0; i < len(args)-1; i += 2 {
		key, ok := args[i].(string)
		if !ok {
			key = fmt.Sprintf("%v", args[i])
		}
		attrs = append(attrs, slog.Any(key, args[i+1]))
	}
	return attrs
}
