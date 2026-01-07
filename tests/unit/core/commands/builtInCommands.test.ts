/**
 * Tests for built-in slash commands.
 */

import {
  BUILT_IN_COMMANDS,
  detectBuiltInCommand,
  getBuiltInCommandsForDropdown,
} from '../../../../src/core/commands/builtInCommands';

describe('builtInCommands', () => {
  describe('detectBuiltInCommand', () => {
    it('detects /clear command', () => {
      const result = detectBuiltInCommand('/clear');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('clear');
      expect(result?.action).toBe('clear');
    });

    it('detects /new command as alias for clear', () => {
      const result = detectBuiltInCommand('/new');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('clear');
      expect(result?.action).toBe('clear');
    });

    it('is case-insensitive', () => {
      expect(detectBuiltInCommand('/CLEAR')).not.toBeNull();
      expect(detectBuiltInCommand('/Clear')).not.toBeNull();
      expect(detectBuiltInCommand('/NEW')).not.toBeNull();
    });

    it('detects command with trailing whitespace', () => {
      const result = detectBuiltInCommand('/clear ');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('clear');
    });

    it('detects command with arguments (arguments ignored)', () => {
      const result = detectBuiltInCommand('/clear some arguments');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('clear');
    });

    it('returns null for non-slash input', () => {
      expect(detectBuiltInCommand('clear')).toBeNull();
      expect(detectBuiltInCommand('hello /clear')).toBeNull();
    });

    it('returns null for unknown commands', () => {
      expect(detectBuiltInCommand('/unknown')).toBeNull();
      expect(detectBuiltInCommand('/foo')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(detectBuiltInCommand('')).toBeNull();
      expect(detectBuiltInCommand('   ')).toBeNull();
    });

    it('returns null for just slash', () => {
      expect(detectBuiltInCommand('/')).toBeNull();
    });
  });

  describe('getBuiltInCommandsForDropdown', () => {
    it('returns all built-in commands with proper format', () => {
      const commands = getBuiltInCommandsForDropdown();

      expect(commands.length).toBe(BUILT_IN_COMMANDS.length);

      const clearCmd = commands.find((c) => c.name === 'clear');
      expect(clearCmd).toBeDefined();
      expect(clearCmd?.id).toBe('builtin:clear');
      expect(clearCmd?.description).toBe('Start a new conversation');
      expect(clearCmd?.content).toBe('');
    });

    it('returns commands compatible with SlashCommand interface', () => {
      const commands = getBuiltInCommandsForDropdown();

      for (const cmd of commands) {
        expect(cmd).toHaveProperty('id');
        expect(cmd).toHaveProperty('name');
        expect(cmd).toHaveProperty('description');
        expect(cmd).toHaveProperty('content');
      }
    });
  });

  describe('BUILT_IN_COMMANDS', () => {
    it('has clear command with new alias', () => {
      const clearCmd = BUILT_IN_COMMANDS.find((c) => c.name === 'clear');
      expect(clearCmd).toBeDefined();
      expect(clearCmd?.aliases).toContain('new');
      expect(clearCmd?.action).toBe('clear');
    });
  });
});
