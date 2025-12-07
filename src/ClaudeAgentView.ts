import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon } from 'obsidian';
import type ClaudeAgentPlugin from './main';
import { VIEW_TYPE_CLAUDE_AGENT, ChatMessage, StreamChunk, ToolCallInfo, ContentBlock } from './types';

export class ClaudeAgentView extends ItemView {
  private plugin: ClaudeAgentPlugin;
  private messages: ChatMessage[] = [];
  private messagesEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private isStreaming = false;
  private toolCallElements: Map<string, HTMLElement> = new Map();

  // For maintaining stream order
  private currentContentEl: HTMLElement | null = null;
  private currentTextEl: HTMLElement | null = null;
  private currentTextContent: string = '';

  // Thinking indicator
  private thinkingEl: HTMLElement | null = null;
  private hasReceivedContent = false;

  // Conversation history UI
  private currentConversationId: string | null = null;
  private historyDropdown: HTMLElement | null = null;

  private static readonly FLAVOR_TEXTS = [
    'Thinking...',
    'Ruminating...',
    'Pondering...',
    'Contemplating...',
    'Processing...',
    'Analyzing...',
    'Considering...',
    'Reflecting...',
    'Mulling it over...',
    'Working on it...',
    'Let me think...',
    'Hmm...',
    'One moment...',
    'On it...',
  ];

  constructor(leaf: WorkspaceLeaf, plugin: ClaudeAgentPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CLAUDE_AGENT;
  }

  getDisplayText(): string {
    return 'Claude Agent';
  }

  getIcon(): string {
    return 'bot';
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('claude-agent-container');

    // Header
    const header = container.createDiv({ cls: 'claude-agent-header' });

    // Left side: Logo + Title
    const titleContainer = header.createDiv({ cls: 'claude-agent-title' });
    const logoEl = titleContainer.createSpan({ cls: 'claude-agent-logo' });
    logoEl.innerHTML = `<svg viewBox="0 0 100 100" width="16" height="16">
      <g fill="#D97757">
        ${Array.from({ length: 12 }, (_, i) => {
          const angle = (i * 30 - 90) * Math.PI / 180;
          const cx = 53, cy = 50;
          const x1 = cx + 15 * Math.cos(angle);
          const y1 = cy + 15 * Math.sin(angle);
          const x2 = cx + 45 * Math.cos(angle);
          const y2 = cy + 45 * Math.sin(angle);
          return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#D97757" stroke-width="8" stroke-linecap="round"/>`;
        }).join('')}
      </g>
    </svg>`;
    titleContainer.createEl('h4', { text: 'Claude Agent' });

    // Right side: Header actions
    const headerActions = header.createDiv({ cls: 'claude-agent-header-actions' });

    // History dropdown container
    const historyContainer = headerActions.createDiv({ cls: 'claude-agent-history-container' });

    // Dropdown trigger (icon button)
    const trigger = historyContainer.createDiv({ cls: 'claude-agent-header-btn' });
    setIcon(trigger, 'history');
    trigger.setAttribute('aria-label', 'Chat history');

    // Dropdown menu
    this.historyDropdown = historyContainer.createDiv({ cls: 'claude-agent-history-menu' });

    // Toggle dropdown on trigger click
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleHistoryDropdown();
    });

    // Close dropdown when clicking outside
    this.registerDomEvent(document, 'click', () => {
      this.historyDropdown?.removeClass('visible');
    });

    // New conversation button
    const newBtn = headerActions.createDiv({ cls: 'claude-agent-header-btn' });
    setIcon(newBtn, 'plus');
    newBtn.setAttribute('aria-label', 'New conversation');
    newBtn.addEventListener('click', () => this.createNewConversation());

    // Messages area
    this.messagesEl = container.createDiv({ cls: 'claude-agent-messages' });

    // Input area
    const inputContainer = container.createDiv({ cls: 'claude-agent-input-container' });

    this.inputEl = inputContainer.createEl('textarea', {
      cls: 'claude-agent-input',
      attr: {
        placeholder: 'Ask Claude anything... (Enter to send, Shift+Enter for newline)',
        rows: '3',
      },
    });

    // Event handlers
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Load active conversation or create new
    await this.loadActiveConversation();
  }

  async onClose() {
    // Save current conversation before closing
    await this.saveCurrentConversation();
  }

  private async sendMessage() {
    const content = this.inputEl.value.trim();
    if (!content || this.isStreaming) return;

    this.inputEl.value = '';
    this.isStreaming = true;

    // Add user message
    const userMsg: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    this.addMessage(userMsg);

    // Auto-generate title from first user message
    if (this.messages.length === 1 && this.currentConversationId) {
      const title = this.generateTitle(content);
      await this.plugin.renameConversation(this.currentConversationId, title);
    }

    // Create assistant message placeholder
    const assistantMsg: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
      contentBlocks: [],
    };
    const msgEl = this.addMessage(assistantMsg);
    const contentEl = msgEl.querySelector('.claude-agent-message-content') as HTMLElement;

    // Reset streaming state
    this.toolCallElements.clear();
    this.currentContentEl = contentEl;
    this.currentTextEl = null;
    this.currentTextContent = '';
    this.hasReceivedContent = false;

    // Show thinking indicator
    this.showThinkingIndicator(contentEl);

    try {
      // Pass conversation history for session expiration recovery
      for await (const chunk of this.plugin.agentService.query(content, this.messages)) {
        await this.handleStreamChunk(chunk, assistantMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.appendText(`\n\n**Error:** ${errorMsg}`);
    } finally {
      this.hideThinkingIndicator();
      this.isStreaming = false;
      this.currentContentEl = null;

      // Finalize any remaining text block
      this.finalizeCurrentTextBlock(assistantMsg);

      // Auto-save after message completion
      await this.saveCurrentConversation();
    }
  }

  private showThinkingIndicator(parentEl: HTMLElement) {
    this.thinkingEl = parentEl.createDiv({ cls: 'claude-agent-thinking' });
    // Display one random flavor text
    const texts = ClaudeAgentView.FLAVOR_TEXTS;
    const randomText = texts[Math.floor(Math.random() * texts.length)];
    this.thinkingEl.setText(randomText);
  }

  private hideThinkingIndicator() {
    if (this.thinkingEl) {
      this.thinkingEl.remove();
      this.thinkingEl = null;
    }
  }

  private async handleStreamChunk(
    chunk: StreamChunk,
    msg: ChatMessage
  ) {
    // Hide thinking indicator on first real content
    if (!this.hasReceivedContent && (chunk.type === 'text' || chunk.type === 'tool_use')) {
      this.hasReceivedContent = true;
      this.hideThinkingIndicator();
    }

    switch (chunk.type) {
      case 'text':
        msg.content += chunk.content;
        await this.appendText(chunk.content);
        break;

      case 'tool_use':
        if (this.plugin.settings.showToolUse) {
          // Finalize current text block before adding tool
          this.finalizeCurrentTextBlock(msg);

          // Add tool_use reference to contentBlocks
          msg.contentBlocks = msg.contentBlocks || [];
          msg.contentBlocks.push({ type: 'tool_use', toolId: chunk.id });

          const toolCall: ToolCallInfo = {
            id: chunk.id,
            name: chunk.name,
            input: chunk.input,
            status: 'running',
            isExpanded: false,
          };
          msg.toolCalls = msg.toolCalls || [];
          msg.toolCalls.push(toolCall);
          this.renderToolCall(this.currentContentEl!, toolCall);
        }
        break;

      case 'tool_result':
        if (this.plugin.settings.showToolUse) {
          const toolCall = msg.toolCalls?.find(tc => tc.id === chunk.id);
          if (toolCall) {
            toolCall.status = chunk.isError ? 'error' : 'completed';
            toolCall.result = chunk.content;
            this.updateToolCallResult(chunk.id, toolCall);
          }
        }
        break;

      case 'blocked':
        await this.appendText(`\n\n⚠️ **Blocked:** ${chunk.content}`);
        break;

      case 'error':
        await this.appendText(`\n\n❌ **Error:** ${chunk.content}`);
        break;

      case 'done':
        break;
    }

    // Auto-scroll to bottom
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private async appendText(text: string) {
    if (!this.currentContentEl) return;

    // Create text block if needed
    if (!this.currentTextEl) {
      this.currentTextEl = this.currentContentEl.createDiv({ cls: 'claude-agent-text-block' });
      this.currentTextContent = '';
    }

    this.currentTextContent += text;
    await this.renderContent(this.currentTextEl, this.currentTextContent);
  }

  private finalizeCurrentTextBlock(msg?: ChatMessage) {
    // Save current text block to contentBlocks if there's content
    if (msg && this.currentTextContent) {
      msg.contentBlocks = msg.contentBlocks || [];
      msg.contentBlocks.push({ type: 'text', content: this.currentTextContent });
    }
    // Start fresh text block after tool call
    this.currentTextEl = null;
    this.currentTextContent = '';
  }

  private addMessage(msg: ChatMessage): HTMLElement {
    this.messages.push(msg);

    const msgEl = this.messagesEl.createDiv({
      cls: `claude-agent-message claude-agent-message-${msg.role}`,
    });

    const contentEl = msgEl.createDiv({ cls: 'claude-agent-message-content' });

    // For user messages, render content directly
    if (msg.role === 'user' && msg.content) {
      const textEl = contentEl.createDiv({ cls: 'claude-agent-text-block' });
      this.renderContent(textEl, msg.content);
    }
    // For assistant messages, content will be added dynamically during streaming

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return msgEl;
  }

  private addSystemMessage(content: string) {
    const msgEl = this.messagesEl.createDiv({
      cls: 'claude-agent-message claude-agent-message-system',
    });
    msgEl.setText(content);
  }

  private async renderContent(el: HTMLElement, markdown: string) {
    el.empty();
    await MarkdownRenderer.renderMarkdown(markdown, el, '', this);
  }

  private renderToolCall(parentEl: HTMLElement, toolCall: ToolCallInfo) {
    const toolEl = parentEl.createDiv({ cls: 'claude-agent-tool-call' });
    toolEl.dataset.toolId = toolCall.id;
    this.toolCallElements.set(toolCall.id, toolEl);

    // Header (clickable to expand/collapse)
    const header = toolEl.createDiv({ cls: 'claude-agent-tool-header' });

    // Chevron icon
    const chevron = header.createSpan({ cls: 'claude-agent-tool-chevron' });
    setIcon(chevron, 'chevron-right');

    // Tool icon
    const iconEl = header.createSpan({ cls: 'claude-agent-tool-icon' });
    this.setToolIcon(iconEl, toolCall.name);

    // Tool label
    const labelEl = header.createSpan({ cls: 'claude-agent-tool-label' });
    labelEl.setText(this.getToolLabel(toolCall.name, toolCall.input));

    // Status indicator
    const statusEl = header.createSpan({ cls: 'claude-agent-tool-status' });
    statusEl.addClass(`status-${toolCall.status}`);
    if (toolCall.status === 'running') {
      statusEl.createSpan({ cls: 'claude-agent-spinner' });
    }

    // Collapsible content
    const content = toolEl.createDiv({ cls: 'claude-agent-tool-content' });
    content.style.display = 'none';

    // Input parameters
    const inputSection = content.createDiv({ cls: 'claude-agent-tool-input' });
    inputSection.createDiv({ cls: 'claude-agent-tool-section-label', text: 'Input' });
    const inputCode = inputSection.createEl('pre', { cls: 'claude-agent-tool-code' });
    inputCode.setText(this.formatToolInput(toolCall.name, toolCall.input));

    // Result placeholder
    const resultSection = content.createDiv({ cls: 'claude-agent-tool-result' });
    resultSection.createDiv({ cls: 'claude-agent-tool-section-label', text: 'Result' });
    const resultCode = resultSection.createEl('pre', { cls: 'claude-agent-tool-code claude-agent-tool-result-code' });
    resultCode.setText('Running...');

    // Toggle expand/collapse on header click
    header.addEventListener('click', () => {
      toolCall.isExpanded = !toolCall.isExpanded;
      if (toolCall.isExpanded) {
        content.style.display = 'block';
        toolEl.addClass('expanded');
        setIcon(chevron, 'chevron-down');
      } else {
        content.style.display = 'none';
        toolEl.removeClass('expanded');
        setIcon(chevron, 'chevron-right');
      }
    });
  }

  private updateToolCallResult(toolId: string, toolCall: ToolCallInfo) {
    const toolEl = this.toolCallElements.get(toolId);
    if (!toolEl) return;

    // Update status indicator
    const statusEl = toolEl.querySelector('.claude-agent-tool-status');
    if (statusEl) {
      statusEl.className = 'claude-agent-tool-status';
      statusEl.addClass(`status-${toolCall.status}`);
      statusEl.empty();
      if (toolCall.status === 'completed') {
        setIcon(statusEl as HTMLElement, 'check');
      } else if (toolCall.status === 'error') {
        setIcon(statusEl as HTMLElement, 'x');
      }
    }

    // Update result content
    const resultCode = toolEl.querySelector('.claude-agent-tool-result-code');
    if (resultCode && toolCall.result) {
      const truncated = this.truncateResult(toolCall.result);
      resultCode.setText(truncated);
    }
  }

  private setToolIcon(el: HTMLElement, name: string) {
    const iconMap: Record<string, string> = {
      'Read': 'file-text',
      'Write': 'edit-3',
      'Edit': 'edit',
      'Bash': 'terminal',
      'Glob': 'folder-search',
      'Grep': 'search',
      'LS': 'list',
    };
    setIcon(el, iconMap[name] || 'wrench');
  }

  private getToolLabel(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case 'Read':
        return `Read ${this.shortenPath(input.file_path as string) || 'file'}`;
      case 'Write':
        return `Write ${this.shortenPath(input.file_path as string) || 'file'}`;
      case 'Edit':
        return `Edit ${this.shortenPath(input.file_path as string) || 'file'}`;
      case 'Bash':
        const cmd = (input.command as string) || 'command';
        return `Bash: ${cmd.length > 40 ? cmd.substring(0, 40) + '...' : cmd}`;
      case 'Glob':
        return `Glob: ${input.pattern || 'files'}`;
      case 'Grep':
        return `Grep: ${input.pattern || 'pattern'}`;
      case 'LS':
        return `LS: ${this.shortenPath(input.path as string) || '.'}`;
      default:
        return name;
    }
  }

  private shortenPath(path: string | undefined): string {
    if (!path) return '';
    const parts = path.split('/');
    if (parts.length <= 3) return path;
    return '.../' + parts.slice(-2).join('/');
  }

  private formatToolInput(name: string, input: Record<string, unknown>): string {
    // Format nicely based on tool type
    switch (name) {
      case 'Read':
      case 'Write':
      case 'Edit':
        return input.file_path as string || JSON.stringify(input, null, 2);
      case 'Bash':
        return (input.command as string) || JSON.stringify(input, null, 2);
      case 'Glob':
      case 'Grep':
        return (input.pattern as string) || JSON.stringify(input, null, 2);
      default:
        return JSON.stringify(input, null, 2);
    }
  }

  private truncateResult(result: string, maxLines = 20, maxLength = 2000): string {
    if (result.length > maxLength) {
      result = result.substring(0, maxLength) + '\n... (truncated)';
    }
    const lines = result.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
    }
    return result;
  }

  /**
   * Create a new conversation
   */
  private async createNewConversation() {
    if (this.isStreaming) {
      return; // Don't switch while streaming
    }

    // Save current conversation first (if has messages)
    if (this.messages.length > 0) {
      await this.saveCurrentConversation();
    }

    // Create new conversation
    const conversation = await this.plugin.createConversation();

    this.currentConversationId = conversation.id;
    this.messages = [];
    this.messagesEl.empty();
  }

  /**
   * Load the active conversation on view open
   */
  private async loadActiveConversation() {
    let conversation = this.plugin.getActiveConversation();

    if (!conversation) {
      conversation = await this.plugin.createConversation();
    }

    this.currentConversationId = conversation.id;
    this.messages = [...conversation.messages];

    // Restore session ID
    this.plugin.agentService.setSessionId(conversation.sessionId);

    // Render all stored messages
    this.renderMessages();
  }

  /**
   * Switch to a different conversation
   */
  private async onConversationSelect(id: string) {
    if (id === this.currentConversationId) return;
    if (this.isStreaming) {
      return; // Don't switch while streaming
    }

    // Save current conversation first
    await this.saveCurrentConversation();

    // Switch to selected conversation
    const conversation = await this.plugin.switchConversation(id);
    if (!conversation) return;

    this.currentConversationId = conversation.id;
    this.messages = [...conversation.messages];

    // Render messages
    this.renderMessages();

    // Close dropdown
    this.historyDropdown?.removeClass('visible');
  }

  /**
   * Save current conversation state
   */
  private async saveCurrentConversation() {
    if (!this.currentConversationId) return;

    const sessionId = this.plugin.agentService.getSessionId();
    await this.plugin.updateConversation(this.currentConversationId, {
      messages: this.messages,
      sessionId: sessionId,
    });
  }

  /**
   * Render all messages for a loaded conversation
   */
  private renderMessages() {
    this.messagesEl.empty();

    for (const msg of this.messages) {
      if (msg.role === 'system') {
        this.addSystemMessage(msg.content);
      } else {
        this.renderStoredMessage(msg);
      }
    }

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /**
   * Render a stored message (non-streaming)
   */
  private renderStoredMessage(msg: ChatMessage) {
    const msgEl = this.messagesEl.createDiv({
      cls: `claude-agent-message claude-agent-message-${msg.role}`,
    });

    const contentEl = msgEl.createDiv({ cls: 'claude-agent-message-content' });

    if (msg.role === 'user') {
      const textEl = contentEl.createDiv({ cls: 'claude-agent-text-block' });
      this.renderContent(textEl, msg.content);
    } else if (msg.role === 'assistant') {
      // Use contentBlocks for proper ordering if available
      if (msg.contentBlocks && msg.contentBlocks.length > 0) {
        for (const block of msg.contentBlocks) {
          if (block.type === 'text') {
            const textEl = contentEl.createDiv({ cls: 'claude-agent-text-block' });
            this.renderContent(textEl, block.content);
          } else if (block.type === 'tool_use' && this.plugin.settings.showToolUse) {
            const toolCall = msg.toolCalls?.find(tc => tc.id === block.toolId);
            if (toolCall) {
              this.renderStoredToolCall(contentEl, toolCall);
            }
          }
        }
      } else {
        // Fallback for old conversations without contentBlocks
        if (msg.content) {
          const textEl = contentEl.createDiv({ cls: 'claude-agent-text-block' });
          this.renderContent(textEl, msg.content);
        }
        if (msg.toolCalls && this.plugin.settings.showToolUse) {
          for (const toolCall of msg.toolCalls) {
            this.renderStoredToolCall(contentEl, toolCall);
          }
        }
      }
    }
  }

  /**
   * Render a stored tool call (completed state)
   */
  private renderStoredToolCall(parentEl: HTMLElement, toolCall: ToolCallInfo) {
    const toolEl = parentEl.createDiv({ cls: 'claude-agent-tool-call' });

    // Header
    const header = toolEl.createDiv({ cls: 'claude-agent-tool-header' });

    // Chevron icon
    const chevron = header.createSpan({ cls: 'claude-agent-tool-chevron' });
    setIcon(chevron, 'chevron-right');

    // Tool icon
    const iconEl = header.createSpan({ cls: 'claude-agent-tool-icon' });
    this.setToolIcon(iconEl, toolCall.name);

    // Tool label
    const labelEl = header.createSpan({ cls: 'claude-agent-tool-label' });
    labelEl.setText(this.getToolLabel(toolCall.name, toolCall.input));

    // Status indicator (already completed)
    const statusEl = header.createSpan({ cls: 'claude-agent-tool-status' });
    statusEl.addClass(`status-${toolCall.status}`);
    if (toolCall.status === 'completed') {
      setIcon(statusEl, 'check');
    } else if (toolCall.status === 'error') {
      setIcon(statusEl, 'x');
    }

    // Collapsible content
    const content = toolEl.createDiv({ cls: 'claude-agent-tool-content' });
    content.style.display = 'none';

    // Input parameters
    const inputSection = content.createDiv({ cls: 'claude-agent-tool-input' });
    inputSection.createDiv({ cls: 'claude-agent-tool-section-label', text: 'Input' });
    const inputCode = inputSection.createEl('pre', { cls: 'claude-agent-tool-code' });
    inputCode.setText(this.formatToolInput(toolCall.name, toolCall.input));

    // Result
    const resultSection = content.createDiv({ cls: 'claude-agent-tool-result' });
    resultSection.createDiv({ cls: 'claude-agent-tool-section-label', text: 'Result' });
    const resultCode = resultSection.createEl('pre', { cls: 'claude-agent-tool-code' });
    resultCode.setText(toolCall.result ? this.truncateResult(toolCall.result) : 'No result');

    // Toggle expand/collapse on header click
    let isExpanded = false;
    header.addEventListener('click', () => {
      isExpanded = !isExpanded;
      if (isExpanded) {
        content.style.display = 'block';
        toolEl.addClass('expanded');
        setIcon(chevron, 'chevron-down');
      } else {
        content.style.display = 'none';
        toolEl.removeClass('expanded');
        setIcon(chevron, 'chevron-right');
      }
    });
  }

  /**
   * Toggle history dropdown visibility
   */
  private toggleHistoryDropdown() {
    if (!this.historyDropdown) return;

    const isVisible = this.historyDropdown.hasClass('visible');
    if (isVisible) {
      this.historyDropdown.removeClass('visible');
    } else {
      this.updateHistoryDropdown();
      this.historyDropdown.addClass('visible');
    }
  }

  /**
   * Update history dropdown content
   */
  private updateHistoryDropdown() {
    if (!this.historyDropdown) return;

    this.historyDropdown.empty();

    // Header
    const dropdownHeader = this.historyDropdown.createDiv({ cls: 'claude-agent-history-header' });
    dropdownHeader.createSpan({ text: 'Conversations' });

    // Conversation list (exclude current session)
    const list = this.historyDropdown.createDiv({ cls: 'claude-agent-history-list' });
    const conversations = this.plugin.getConversationList()
      .filter(conv => conv.id !== this.currentConversationId);

    if (conversations.length === 0) {
      list.createDiv({ cls: 'claude-agent-history-empty', text: 'No other conversations' });
      return;
    }

    for (const conv of conversations) {
      const item = list.createDiv({ cls: 'claude-agent-history-item' });

      // Icon
      const iconEl = item.createDiv({ cls: 'claude-agent-history-item-icon' });
      setIcon(iconEl, 'message-square');

      // Content area (clickable to switch)
      const content = item.createDiv({ cls: 'claude-agent-history-item-content' });
      content.createDiv({ cls: 'claude-agent-history-item-title', text: conv.title });
      content.createDiv({
        cls: 'claude-agent-history-item-date',
        text: this.formatDate(conv.updatedAt),
      });

      content.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.onConversationSelect(conv.id);
      });

      // Action buttons
      const actions = item.createDiv({ cls: 'claude-agent-history-item-actions' });

      const renameBtn = actions.createEl('button', { cls: 'claude-agent-action-btn' });
      setIcon(renameBtn, 'pencil');
      renameBtn.setAttribute('aria-label', 'Rename');
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showRenameInput(item, conv.id, conv.title);
      });

      const deleteBtn = actions.createEl('button', { cls: 'claude-agent-action-btn claude-agent-delete-btn' });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.setAttribute('aria-label', 'Delete');
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (this.isStreaming) {
          return;
        }
        await this.plugin.deleteConversation(conv.id);
        this.updateHistoryDropdown();

        // If deleted current, reload the new active
        if (conv.id === this.currentConversationId) {
          await this.loadActiveConversation();
        }
      });
    }
  }

  /**
   * Show inline rename input
   */
  private showRenameInput(item: HTMLElement, convId: string, currentTitle: string) {
    const titleEl = item.querySelector('.claude-agent-history-item-title') as HTMLElement;
    if (!titleEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'claude-agent-rename-input';
    input.value = currentTitle;

    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const finishRename = async () => {
      const newTitle = input.value.trim() || currentTitle;
      await this.plugin.renameConversation(convId, newTitle);

      // Update dropdown
      this.updateHistoryDropdown();
    };

    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = currentTitle;
        input.blur();
      }
    });
  }

  /**
   * Generate title from first user message
   */
  private generateTitle(firstMessage: string): string {
    // Extract first sentence or first 50 chars
    const firstSentence = firstMessage.split(/[.!?\n]/)[0].trim();
    const autoTitle = firstSentence.substring(0, 50);
    const suffix = firstSentence.length > 50 ? '...' : '';

    return `${autoTitle}${suffix}`;
  }

  /**
   * Format date for display
   */
  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
