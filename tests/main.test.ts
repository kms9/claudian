import { DEFAULT_SETTINGS, VIEW_TYPE_CLAUDE_AGENT } from '../src/types';

// Mock fs for ClaudeAgentService
jest.mock('fs');

// Now import the plugin after mocking
import ClaudeAgentPlugin from '../src/main';

describe('ClaudeAgentPlugin', () => {
  let plugin: ClaudeAgentPlugin;
  let mockApp: any;
  let mockManifest: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    mockApp = {
      vault: {
        adapter: {
          basePath: '/test/vault',
        },
      },
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([]),
        getRightLeaf: jest.fn().mockReturnValue({
          setViewState: jest.fn().mockResolvedValue(undefined),
        }),
        revealLeaf: jest.fn(),
      },
    };

    mockManifest = {
      id: 'obsidian-claude-agent',
      name: 'Claude Agent',
      version: '0.1.0',
    };

    // Create plugin instance with mocked app
    plugin = new ClaudeAgentPlugin(mockApp, mockManifest);
    (plugin.loadData as jest.Mock).mockResolvedValue({});
  });

  describe('onload', () => {
    it('should initialize settings with defaults', async () => {
      await plugin.onload();

      expect(plugin.settings).toBeDefined();
      expect(plugin.settings.enableBlocklist).toBe(DEFAULT_SETTINGS.enableBlocklist);
      expect(plugin.settings.showToolUse).toBe(DEFAULT_SETTINGS.showToolUse);
      expect(plugin.settings.blockedCommands).toEqual(DEFAULT_SETTINGS.blockedCommands);
    });

    it('should initialize agentService', async () => {
      await plugin.onload();

      expect(plugin.agentService).toBeDefined();
    });

    it('should register the view', async () => {
      await plugin.onload();

      expect((plugin.registerView as jest.Mock)).toHaveBeenCalledWith(
        VIEW_TYPE_CLAUDE_AGENT,
        expect.any(Function)
      );
    });

    it('should add ribbon icon', async () => {
      await plugin.onload();

      expect((plugin.addRibbonIcon as jest.Mock)).toHaveBeenCalledWith(
        'bot',
        'Open Claude Agent',
        expect.any(Function)
      );
    });

    it('should add command to open view', async () => {
      await plugin.onload();

      expect((plugin.addCommand as jest.Mock)).toHaveBeenCalledWith({
        id: 'open-claude-agent',
        name: 'Open Claude Agent',
        callback: expect.any(Function),
      });
    });

    it('should add settings tab', async () => {
      await plugin.onload();

      expect((plugin.addSettingTab as jest.Mock)).toHaveBeenCalled();
    });
  });

  describe('onunload', () => {
    it('should call cleanup on agentService', async () => {
      await plugin.onload();

      const cleanupSpy = jest.spyOn(plugin.agentService, 'cleanup');

      plugin.onunload();

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('activateView', () => {
    it('should reveal existing leaf if view already exists', async () => {
      const mockLeaf = { id: 'existing-leaf' };
      mockApp.workspace.getLeavesOfType.mockReturnValue([mockLeaf]);

      await plugin.onload();
      await plugin.activateView();

      expect(mockApp.workspace.revealLeaf).toHaveBeenCalledWith(mockLeaf);
    });

    it('should create new leaf in right sidebar if view does not exist', async () => {
      const mockRightLeaf = {
        setViewState: jest.fn().mockResolvedValue(undefined),
      };
      mockApp.workspace.getLeavesOfType.mockReturnValue([]);
      mockApp.workspace.getRightLeaf.mockReturnValue(mockRightLeaf);

      await plugin.onload();
      await plugin.activateView();

      expect(mockApp.workspace.getRightLeaf).toHaveBeenCalledWith(false);
      expect(mockRightLeaf.setViewState).toHaveBeenCalledWith({
        type: VIEW_TYPE_CLAUDE_AGENT,
        active: true,
      });
    });

    it('should handle null right leaf gracefully', async () => {
      mockApp.workspace.getLeavesOfType.mockReturnValue([]);
      mockApp.workspace.getRightLeaf.mockReturnValue(null);

      await plugin.onload();

      // Should not throw
      await expect(plugin.activateView()).resolves.not.toThrow();
    });
  });

  describe('loadSettings', () => {
    it('should merge saved data with defaults', async () => {
      (plugin.loadData as jest.Mock).mockResolvedValue({
        enableBlocklist: false,
        showToolUse: false,
      });

      await plugin.loadSettings();

      expect(plugin.settings.enableBlocklist).toBe(false);
      expect(plugin.settings.showToolUse).toBe(false);
      // Should still have defaults for blockedCommands
      expect(plugin.settings.blockedCommands).toEqual(DEFAULT_SETTINGS.blockedCommands);
    });

    it('should use defaults when no saved data', async () => {
      (plugin.loadData as jest.Mock).mockResolvedValue(null);

      await plugin.loadSettings();

      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should use defaults when loadData returns empty object', async () => {
      (plugin.loadData as jest.Mock).mockResolvedValue({});

      await plugin.loadSettings();

      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('saveSettings', () => {
    it('should call saveData with settings and conversations', async () => {
      await plugin.onload();

      plugin.settings.enableBlocklist = false;
      plugin.settings.showToolUse = false;

      await plugin.saveSettings();

      expect((plugin.saveData as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({
          enableBlocklist: false,
          showToolUse: false,
          conversations: expect.any(Array),
        })
      );
      // Also verify the structure includes activeConversationId (can be null or string)
      const savedData = (plugin.saveData as jest.Mock).mock.calls[0][0];
      expect(savedData).toHaveProperty('activeConversationId');
    });
  });

  describe('ribbon icon callback', () => {
    it('should call activateView when ribbon icon is clicked', async () => {
      await plugin.onload();

      // Get the callback passed to addRibbonIcon
      const ribbonCallback = (plugin.addRibbonIcon as jest.Mock).mock.calls[0][2];
      const activateViewSpy = jest.spyOn(plugin, 'activateView');

      ribbonCallback();

      expect(activateViewSpy).toHaveBeenCalled();
    });
  });

  describe('command callback', () => {
    it('should call activateView when command is executed', async () => {
      await plugin.onload();

      // Get the callback passed to addCommand
      const commandConfig = (plugin.addCommand as jest.Mock).mock.calls[0][0];
      const activateViewSpy = jest.spyOn(plugin, 'activateView');

      commandConfig.callback();

      expect(activateViewSpy).toHaveBeenCalled();
    });
  });

  describe('createConversation', () => {
    it('should create a new conversation with unique ID', async () => {
      await plugin.onload();

      const conv = await plugin.createConversation();

      expect(conv.id).toMatch(/^conv-\d+-[a-z0-9]+$/);
      expect(conv.messages).toEqual([]);
      expect(conv.sessionId).toBeNull();
    });

    it('should set new conversation as active', async () => {
      await plugin.onload();

      const conv = await plugin.createConversation();
      const active = plugin.getActiveConversation();

      expect(active?.id).toBe(conv.id);
    });

    it('should generate default title with timestamp', async () => {
      await plugin.onload();

      const conv = await plugin.createConversation();

      // Title should contain month and time
      expect(conv.title).toBeTruthy();
      expect(conv.title.length).toBeGreaterThan(0);
    });

    it('should reset agent service session', async () => {
      await plugin.onload();

      const resetSessionSpy = jest.spyOn(plugin.agentService, 'resetSession');

      await plugin.createConversation();

      expect(resetSessionSpy).toHaveBeenCalled();
    });
  });

  describe('switchConversation', () => {
    it('should switch to existing conversation', async () => {
      await plugin.onload();

      const conv1 = await plugin.createConversation();
      const conv2 = await plugin.createConversation();

      expect(plugin.getActiveConversation()?.id).toBe(conv2.id);

      await plugin.switchConversation(conv1.id);

      expect(plugin.getActiveConversation()?.id).toBe(conv1.id);
    });

    it('should restore session ID when switching', async () => {
      await plugin.onload();

      const conv1 = await plugin.createConversation();
      await plugin.updateConversation(conv1.id, { sessionId: 'session-123' });

      await plugin.createConversation();

      const setSessionIdSpy = jest.spyOn(plugin.agentService, 'setSessionId');

      await plugin.switchConversation(conv1.id);

      expect(setSessionIdSpy).toHaveBeenCalledWith('session-123');
    });

    it('should return null for non-existent conversation', async () => {
      await plugin.onload();

      const result = await plugin.switchConversation('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation by ID', async () => {
      await plugin.onload();

      const conv = await plugin.createConversation();
      const convId = conv.id;

      // Create another so we have at least one left
      await plugin.createConversation();

      await plugin.deleteConversation(convId);

      const list = plugin.getConversationList();
      expect(list.find(c => c.id === convId)).toBeUndefined();
    });

    it('should create new conversation if deleted active and no others exist', async () => {
      await plugin.onload();

      const conv = await plugin.createConversation();

      await plugin.deleteConversation(conv.id);

      // Should have created a new conversation
      const active = plugin.getActiveConversation();
      expect(active).not.toBeNull();
      expect(active?.id).not.toBe(conv.id);
    });

    it('should switch to first conversation if deleted active', async () => {
      await plugin.onload();

      const conv1 = await plugin.createConversation();
      const conv2 = await plugin.createConversation();

      // Active is conv2
      expect(plugin.getActiveConversation()?.id).toBe(conv2.id);

      await plugin.deleteConversation(conv2.id);

      // Should switch to conv1
      expect(plugin.getActiveConversation()?.id).toBe(conv1.id);
    });
  });

  describe('renameConversation', () => {
    it('should rename conversation', async () => {
      await plugin.onload();

      const conv = await plugin.createConversation();

      await plugin.renameConversation(conv.id, 'New Title');

      const updated = plugin.getActiveConversation();
      expect(updated?.title).toBe('New Title');
    });

    it('should use default title if empty string provided', async () => {
      await plugin.onload();

      const conv = await plugin.createConversation();

      await plugin.renameConversation(conv.id, '   ');

      const updated = plugin.getActiveConversation();
      expect(updated?.title).toBeTruthy();
    });
  });

  describe('updateConversation', () => {
    it('should update conversation messages', async () => {
      await plugin.onload();

      const conv = await plugin.createConversation();
      const messages = [
        { id: 'msg-1', role: 'user' as const, content: 'Hello', timestamp: Date.now() },
      ];

      await plugin.updateConversation(conv.id, { messages });

      const updated = plugin.getActiveConversation();
      expect(updated?.messages).toEqual(messages);
    });

    it('should update conversation sessionId', async () => {
      await plugin.onload();

      const conv = await plugin.createConversation();

      await plugin.updateConversation(conv.id, { sessionId: 'new-session-id' });

      const updated = plugin.getActiveConversation();
      expect(updated?.sessionId).toBe('new-session-id');
    });

    it('should update updatedAt timestamp', async () => {
      await plugin.onload();

      const conv = await plugin.createConversation();
      const originalUpdatedAt = conv.updatedAt;

      // Small delay to ensure timestamp differs
      await new Promise(resolve => setTimeout(resolve, 10));

      await plugin.updateConversation(conv.id, { title: 'Changed' });

      const updated = plugin.getActiveConversation();
      expect(updated?.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });
  });

  describe('getConversationList', () => {
    it('should return conversation metadata', async () => {
      await plugin.onload();

      await plugin.createConversation();

      const list = plugin.getConversationList();

      expect(list.length).toBeGreaterThan(0);
      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('title');
      expect(list[0]).toHaveProperty('messageCount');
      expect(list[0]).toHaveProperty('preview');
    });

    it('should return preview from first user message', async () => {
      await plugin.onload();

      const conv = await plugin.createConversation();
      await plugin.updateConversation(conv.id, {
        messages: [
          { id: 'msg-1', role: 'user', content: 'Hello Claude', timestamp: Date.now() },
        ],
      });

      const list = plugin.getConversationList();
      const meta = list.find(c => c.id === conv.id);

      expect(meta?.preview).toContain('Hello Claude');
    });
  });

  describe('loadSettings with conversations', () => {
    it('should load saved conversations', async () => {
      const savedConversations = [
        {
          id: 'conv-saved-1',
          title: 'Saved Chat',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          sessionId: 'saved-session',
          messages: [],
        },
      ];

      (plugin.loadData as jest.Mock).mockResolvedValue({
        conversations: savedConversations,
        activeConversationId: 'conv-saved-1',
      });

      await plugin.loadSettings();

      const active = plugin.getActiveConversation();
      expect(active?.id).toBe('conv-saved-1');
      expect(active?.title).toBe('Saved Chat');
    });

    it('should handle invalid activeConversationId', async () => {
      (plugin.loadData as jest.Mock).mockResolvedValue({
        conversations: [],
        activeConversationId: 'non-existent',
      });

      await plugin.loadSettings();

      const list = plugin.getConversationList();
      // Should have cleared the invalid ID
      expect(plugin.getActiveConversation()).toBeNull();
    });
  });

  describe('max conversations pruning', () => {
    it('should retain active conversation when pruning to max limit', async () => {
      await plugin.onload();

      // Create conversations with default max (50)
      const conv1 = await plugin.createConversation();
      await plugin.createConversation();

      // Switch to older conversation
      await plugin.switchConversation(conv1.id);

      // Now set max to 1 and force prune
      plugin.settings.maxConversations = 1;
      (plugin as any).pruneOldConversations();

      // Active conversation (conv1) should be retained even though it's older
      expect(plugin.getActiveConversation()?.id).toBe(conv1.id);
      const list = plugin.getConversationList();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(conv1.id);
    });
  });
});
