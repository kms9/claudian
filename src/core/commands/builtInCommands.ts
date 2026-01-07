/**
 * Claudian - Built-in slash commands
 *
 * System commands that perform actions (not prompt expansions).
 * These are handled separately from user-defined slash commands.
 */

/** Built-in command action types. */
export type BuiltInCommandAction = 'clear';

/** Built-in command definition. */
export interface BuiltInCommand {
  name: string;
  aliases?: string[];
  description: string;
  action: BuiltInCommandAction;
}

/** All built-in commands. */
export const BUILT_IN_COMMANDS: BuiltInCommand[] = [
  {
    name: 'clear',
    aliases: ['new'],
    description: 'Start a new conversation',
    action: 'clear',
  },
];

/** Map of command names/aliases to their definitions. */
const commandMap = new Map<string, BuiltInCommand>();

// Build lookup map including aliases
for (const cmd of BUILT_IN_COMMANDS) {
  commandMap.set(cmd.name.toLowerCase(), cmd);
  if (cmd.aliases) {
    for (const alias of cmd.aliases) {
      commandMap.set(alias.toLowerCase(), cmd);
    }
  }
}

/**
 * Checks if input is a built-in command.
 * Returns the command if found, null otherwise.
 */
export function detectBuiltInCommand(input: string): BuiltInCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  // Extract command name (first word after /)
  const match = trimmed.match(/^\/([a-zA-Z0-9_-]+)(?:\s|$)/);
  if (!match) return null;

  const cmdName = match[1].toLowerCase();
  return commandMap.get(cmdName) ?? null;
}

/**
 * Gets all built-in commands for dropdown display.
 * Returns commands in a format compatible with SlashCommand interface.
 */
export function getBuiltInCommandsForDropdown(): Array<{
  id: string;
  name: string;
  description: string;
  content: string;
}> {
  return BUILT_IN_COMMANDS.map((cmd) => ({
    id: `builtin:${cmd.name}`,
    name: cmd.name,
    description: cmd.description,
    content: '', // Built-in commands don't have prompt content
  }));
}
