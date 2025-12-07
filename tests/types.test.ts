import {
  VIEW_TYPE_CLAUDE_AGENT,
  DEFAULT_SETTINGS,
  ClaudeAgentSettings,
  ChatMessage,
  ToolCallInfo,
  StreamChunk,
  Conversation,
  ConversationMeta,
} from '../src/types';

describe('types.ts', () => {
  describe('VIEW_TYPE_CLAUDE_AGENT', () => {
    it('should be defined as the correct view type', () => {
      expect(VIEW_TYPE_CLAUDE_AGENT).toBe('claude-agent-view');
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('should have enableBlocklist set to true by default', () => {
      expect(DEFAULT_SETTINGS.enableBlocklist).toBe(true);
    });

    it('should have showToolUse set to true by default', () => {
      expect(DEFAULT_SETTINGS.showToolUse).toBe(true);
    });

    it('should have default blocked commands', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toBeInstanceOf(Array);
      expect(DEFAULT_SETTINGS.blockedCommands.length).toBeGreaterThan(0);
    });

    it('should block rm -rf by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('rm -rf');
    });

    it('should block rm -r / by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('rm -r /');
    });

    it('should block chmod 777 by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('chmod 777');
    });

    it('should block chmod -R 777 by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('chmod -R 777');
    });

    it('should block mkfs by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('mkfs');
    });

    it('should block dd if= by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('dd if=');
    });

    it('should block > /dev/sd by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('> /dev/sd');
    });

    it('should have exactly 7 default blocked commands', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toHaveLength(7);
    });

    it('should have maxConversations set to 50 by default', () => {
      expect(DEFAULT_SETTINGS.maxConversations).toBe(50);
    });
  });

  describe('ClaudeAgentSettings type', () => {
    it('should be assignable with valid settings', () => {
      const settings: ClaudeAgentSettings = {
        enableBlocklist: false,
        blockedCommands: ['test'],
        showToolUse: false,
        maxConversations: 25,
      };

      expect(settings.enableBlocklist).toBe(false);
      expect(settings.blockedCommands).toEqual(['test']);
      expect(settings.showToolUse).toBe(false);
      expect(settings.maxConversations).toBe(25);
    });
  });

  describe('ChatMessage type', () => {
    it('should accept user role', () => {
      const msg: ChatMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };

      expect(msg.role).toBe('user');
    });

    it('should accept assistant role', () => {
      const msg: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: Date.now(),
      };

      expect(msg.role).toBe('assistant');
    });

    it('should accept system role', () => {
      const msg: ChatMessage = {
        id: 'msg-1',
        role: 'system',
        content: 'System message',
        timestamp: Date.now(),
      };

      expect(msg.role).toBe('system');
    });

    it('should accept optional toolCalls array', () => {
      const toolCalls: ToolCallInfo[] = [
        {
          id: 'tool-1',
          name: 'Read',
          input: { file_path: '/test.txt' },
          status: 'completed',
          result: 'file contents',
        },
      ];

      const msg: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Reading file...',
        timestamp: Date.now(),
        toolCalls,
      };

      expect(msg.toolCalls).toEqual(toolCalls);
    });
  });

  describe('ToolCallInfo type', () => {
    it('should store tool name, input, status, and result', () => {
      const toolCall: ToolCallInfo = {
        id: 'tool-123',
        name: 'Bash',
        input: { command: 'ls -la' },
        status: 'completed',
        result: 'file1.txt\nfile2.txt',
      };

      expect(toolCall.id).toBe('tool-123');
      expect(toolCall.name).toBe('Bash');
      expect(toolCall.input).toEqual({ command: 'ls -la' });
      expect(toolCall.status).toBe('completed');
      expect(toolCall.result).toBe('file1.txt\nfile2.txt');
    });

    it('should accept running status', () => {
      const toolCall: ToolCallInfo = {
        id: 'tool-123',
        name: 'Read',
        input: { file_path: '/test.txt' },
        status: 'running',
      };

      expect(toolCall.status).toBe('running');
    });

    it('should accept error status', () => {
      const toolCall: ToolCallInfo = {
        id: 'tool-123',
        name: 'Read',
        input: { file_path: '/test.txt' },
        status: 'error',
        result: 'File not found',
      };

      expect(toolCall.status).toBe('error');
    });
  });

  describe('StreamChunk type', () => {
    it('should accept text type', () => {
      const chunk: StreamChunk = {
        type: 'text',
        content: 'Hello world',
      };

      expect(chunk.type).toBe('text');
      if (chunk.type === 'text') {
        expect(chunk.content).toBe('Hello world');
      }
    });

    it('should accept tool_use type', () => {
      const chunk: StreamChunk = {
        type: 'tool_use',
        id: 'tool-123',
        name: 'Read',
        input: { file_path: '/test.txt' },
      };

      expect(chunk.type).toBe('tool_use');
      if (chunk.type === 'tool_use') {
        expect(chunk.id).toBe('tool-123');
        expect(chunk.name).toBe('Read');
        expect(chunk.input).toEqual({ file_path: '/test.txt' });
      }
    });

    it('should accept tool_result type', () => {
      const chunk: StreamChunk = {
        type: 'tool_result',
        id: 'tool-123',
        content: 'File contents here',
      };

      expect(chunk.type).toBe('tool_result');
      if (chunk.type === 'tool_result') {
        expect(chunk.id).toBe('tool-123');
        expect(chunk.content).toBe('File contents here');
      }
    });

    it('should accept error type', () => {
      const chunk: StreamChunk = {
        type: 'error',
        content: 'Something went wrong',
      };

      expect(chunk.type).toBe('error');
      if (chunk.type === 'error') {
        expect(chunk.content).toBe('Something went wrong');
      }
    });

    it('should accept blocked type', () => {
      const chunk: StreamChunk = {
        type: 'blocked',
        content: 'Command blocked: rm -rf',
      };

      expect(chunk.type).toBe('blocked');
      if (chunk.type === 'blocked') {
        expect(chunk.content).toBe('Command blocked: rm -rf');
      }
    });

    it('should accept done type', () => {
      const chunk: StreamChunk = {
        type: 'done',
      };

      expect(chunk.type).toBe('done');
    });
  });

  describe('Conversation type', () => {
    it('should store conversation with all required fields', () => {
      const conversation: Conversation = {
        id: 'conv-123',
        title: 'Test Conversation',
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
        sessionId: 'session-abc',
        messages: [],
      };

      expect(conversation.id).toBe('conv-123');
      expect(conversation.title).toBe('Test Conversation');
      expect(conversation.createdAt).toBe(1700000000000);
      expect(conversation.updatedAt).toBe(1700000001000);
      expect(conversation.sessionId).toBe('session-abc');
      expect(conversation.messages).toEqual([]);
    });

    it('should allow null sessionId for new conversations', () => {
      const conversation: Conversation = {
        id: 'conv-456',
        title: 'New Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sessionId: null,
        messages: [],
      };

      expect(conversation.sessionId).toBeNull();
    });

    it('should store messages array with ChatMessage objects', () => {
      const messages: ChatMessage[] = [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: Date.now() },
        { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: Date.now() },
      ];

      const conversation: Conversation = {
        id: 'conv-789',
        title: 'Chat with Messages',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sessionId: 'session-xyz',
        messages,
      };

      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0].role).toBe('user');
      expect(conversation.messages[1].role).toBe('assistant');
    });
  });

  describe('ConversationMeta type', () => {
    it('should store conversation metadata without messages', () => {
      const meta: ConversationMeta = {
        id: 'conv-123',
        title: 'Test Conversation',
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
        messageCount: 5,
        preview: 'Hello, how can I...',
      };

      expect(meta.id).toBe('conv-123');
      expect(meta.title).toBe('Test Conversation');
      expect(meta.createdAt).toBe(1700000000000);
      expect(meta.updatedAt).toBe(1700000001000);
      expect(meta.messageCount).toBe(5);
      expect(meta.preview).toBe('Hello, how can I...');
    });

    it('should have preview for empty conversations', () => {
      const meta: ConversationMeta = {
        id: 'conv-empty',
        title: 'Empty Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
        preview: 'New conversation',
      };

      expect(meta.messageCount).toBe(0);
      expect(meta.preview).toBe('New conversation');
    });
  });
});
