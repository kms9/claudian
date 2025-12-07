// Type definitions for Claude Agent plugin

export const VIEW_TYPE_CLAUDE_AGENT = 'claude-agent-view';

export interface ClaudeAgentSettings {
  enableBlocklist: boolean;
  blockedCommands: string[];
  showToolUse: boolean;
  maxConversations: number;
}

export const DEFAULT_SETTINGS: ClaudeAgentSettings = {
  enableBlocklist: true,
  blockedCommands: [
    'rm -rf',
    'rm -r /',
    'chmod 777',
    'chmod -R 777',
    'mkfs',
    'dd if=',
    '> /dev/sd',
  ],
  showToolUse: true,
  maxConversations: 50,
};

// Conversation persistence types
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sessionId: string | null;
  messages: ChatMessage[];
}

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

// Content block for tracking order of text and tool calls
export type ContentBlock =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; toolId: string };

// Message types for the chat UI
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  // Ordered content blocks to preserve streaming order
  contentBlocks?: ContentBlock[];
}

// Enhanced tool call tracking with status and result
export interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
  isExpanded?: boolean;
}

// Stream chunk types from Claude Agent SDK
export type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; content: string; isError?: boolean }
  | { type: 'error'; content: string }
  | { type: 'blocked'; content: string }
  | { type: 'done' };
