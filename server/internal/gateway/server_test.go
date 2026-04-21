package gateway

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNormalizeGeminiMessageRole(t *testing.T) {
	tests := []struct {
		name        string
		messageType string
		want        string
	}{
		{name: "user", messageType: "user", want: "user"},
		{name: "gemini", messageType: "gemini", want: "assistant"},
		{name: "assistant", messageType: "assistant", want: "assistant"},
		{name: "model", messageType: "model", want: "assistant"},
		{name: "unknown", messageType: "tool", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeGeminiMessageRole(tt.messageType)
			if got != tt.want {
				t.Fatalf("normalizeGeminiMessageRole(%q) = %q, want %q", tt.messageType, got, tt.want)
			}
		})
	}
}

func TestExtractGeminiMessageText_UsesStringContent(t *testing.T) {
	message := geminiSessionMessageFile{
		Type:    "gemini",
		Content: "我是 Google 训练的大型语言模型。",
	}

	got := extractGeminiMessageText(message)
	want := "我是 Google 训练的大型语言模型。"
	if got != want {
		t.Fatalf("extractGeminiMessageText() = %q, want %q", got, want)
	}
}

func TestExtractGeminiMessageText_FallsBackToToolSummary(t *testing.T) {
	message := geminiSessionMessageFile{
		Type:    "gemini",
		Content: "",
		ToolCalls: []geminiSessionToolCall{
			{
				Name:        "write_file",
				DisplayName: "WriteFile",
				Description: "Writing to start.ps1",
				ResultDisplay: &geminiSessionToolResultDisplay{
					FileName:  "start.ps1",
					IsNewFile: true,
				},
			},
		},
	}

	got := extractGeminiMessageText(message)
	if !strings.Contains(got, "WriteFile") {
		t.Fatalf("tool summary should contain display name, got %q", got)
	}
	if !strings.Contains(got, "start.ps1") {
		t.Fatalf("tool summary should contain file name, got %q", got)
	}
}

func TestGeminiSessionFile_UnmarshalAcceptsStringResultDisplay(t *testing.T) {
	data := []byte(`{
		"sessionId": "session-1",
		"messages": [
			{
				"type": "gemini",
				"content": "",
				"toolCalls": [
					{
						"name": "search_file",
						"displayName": "SearchFile",
						"resultDisplay": "Found 17 matching file(s)"
					}
				]
			}
		]
	}`)

	var session geminiSessionFile
	if err := json.Unmarshal(data, &session); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	if len(session.Messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(session.Messages))
	}
	if len(session.Messages[0].ToolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(session.Messages[0].ToolCalls))
	}
	if got := session.Messages[0].ToolCalls[0].ResultDisplay.Text; got != "Found 17 matching file(s)" {
		t.Fatalf("resultDisplay text = %q, want %q", got, "Found 17 matching file(s)")
	}
}

func TestExtractGeminiMessageText_FallsBackToStringResultDisplay(t *testing.T) {
	message := geminiSessionMessageFile{
		Type:    "gemini",
		Content: "",
		ToolCalls: []geminiSessionToolCall{
			{
				Name:        "search_file",
				DisplayName: "SearchFile",
				ResultDisplay: &geminiSessionToolResultDisplay{
					Text: "Found 17 matching file(s)",
				},
			},
		},
	}

	got := extractGeminiMessageText(message)
	if !strings.Contains(got, "Found 17 matching file(s)") {
		t.Fatalf("tool summary should contain resultDisplay text, got %q", got)
	}
}
