import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import { offerProjectScopedMcpConfig } from '../../src/utils/mcp-config';

// Mock types for better type safety
type ConfigContent = {
  mcpServers?: Record<string, { url: string }>;
  servers?: Record<string, { url: string; type?: string }>;
  otherProperty?: string;
};

// Mock the clack utils which wrap the prompts
vi.mock('../../src/utils/clack', () => ({
  abortIfCancelled: vi.fn((value: unknown) => Promise.resolve(value)),
  showCopyPasteInstructions: vi.fn(),
}));

// Mock the external dependencies
vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(),
  select: vi.fn(),
  isCancel: vi.fn(() => false),
  cancel: vi.fn(),
  log: {
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('node:fs');
vi.mock('node:child_process');

describe('mcp-config', () => {
  // Helper to get mocked modules with proper typing
  type ClackMocks = {
    select: ReturnType<typeof vi.fn>;
    log: {
      success: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
    };
  };

  type ClackUtilsMocks = {
    abortIfCancelled: ReturnType<typeof vi.fn>;
    showCopyPasteInstructions: ReturnType<typeof vi.fn>;
  };

  const getMocks = async () => {
    const clack = await vi.importMock<ClackMocks>('@clack/prompts');
    const clackUtils = await vi.importMock<ClackUtilsMocks>(
      '../../src/utils/clack',
    );
    return { clack, clackUtils };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('offerProjectScopedMcpConfig', () => {
    it('should return early if user declines MCP config', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select).mockResolvedValue(false);
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      await offerProjectScopedMcpConfig();

      expect(clack.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'Optionally add a project-scoped MCP server configuration',
          ) as string,
          options: expect.arrayContaining([
            expect.objectContaining({ value: true }),
            expect.objectContaining({ value: false }),
            expect.objectContaining({ value: 'explain' }),
          ]) as unknown[],
          initialValue: true,
        }),
      );
    });

    it('should configure for Cursor when selected', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('cursor');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const mockReadFile = vi
        .fn()
        .mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await offerProjectScopedMcpConfig();

      expect(clack.select).toHaveBeenCalledTimes(2);
      expect(clack.select).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          message: 'Which editor do you want to configure?',
          options: expect.arrayContaining([
            expect.objectContaining({ value: 'cursor' }),
            expect.objectContaining({ value: 'vscode' }),
            expect.objectContaining({ value: 'claudeCode' }),
          ]) as unknown[],
        }),
      );

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.cursor/mcp.json'),
        expect.stringContaining('"mcpServers"'),
        'utf8',
      );

      expect(clack.log.success).toHaveBeenCalledWith(
        expect.stringContaining('.cursor/mcp.json'),
      );
      expect(clack.log.success).toHaveBeenCalledWith(
        'Added project-scoped Sentry MCP configuration.',
      );
      expect(clack.log.info).toHaveBeenCalledWith(
        expect.stringContaining('reload your editor'),
      );
    });

    it('should configure for VS Code when selected', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('vscode');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const mockReadFile = vi
        .fn()
        .mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await offerProjectScopedMcpConfig();

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.vscode/mcp.json'),
        expect.stringContaining('"servers"'),
        'utf8',
      );

      expect(clack.log.success).toHaveBeenCalledWith(
        expect.stringContaining('.vscode/mcp.json'),
      );
    });

    it('should configure for Claude Code when selected', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('claudeCode');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const mockReadFile = vi
        .fn()
        .mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await offerProjectScopedMcpConfig();

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.mcp.json'),
        expect.stringContaining('"mcpServers"'),
        'utf8',
      );

      expect(clack.log.success).toHaveBeenCalledWith(
        expect.stringContaining('.mcp.json'),
      );
    });

    it('should update existing Cursor config file', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('cursor');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const existingConfig = JSON.stringify({
        mcpServers: {
          OtherServer: {
            url: 'https://other.example.com',
          },
        },
      });

      const mockReadFile = vi.fn().mockResolvedValue(existingConfig);
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await offerProjectScopedMcpConfig();

      expect(mockReadFile).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.cursor/mcp.json'),
        expect.stringContaining('Sentry'),
        'utf8',
      );

      const writtenContent = JSON.parse(
        mockWriteFile.mock.calls[0][1] as string,
      ) as ConfigContent;
      expect(writtenContent.mcpServers).toHaveProperty('OtherServer');
      expect(writtenContent.mcpServers).toHaveProperty('Sentry');

      expect(clack.log.success).toHaveBeenCalledWith(
        'Updated .cursor/mcp.json',
      );
    });

    it('should update existing VS Code config file', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('vscode');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const existingConfig = JSON.stringify({
        servers: {
          OtherServer: {
            url: 'https://other.example.com',
            type: 'http',
          },
        },
      });

      const mockReadFile = vi.fn().mockResolvedValue(existingConfig);
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await offerProjectScopedMcpConfig();

      const writtenContent = JSON.parse(
        mockWriteFile.mock.calls[0][1] as string,
      ) as ConfigContent;
      expect(writtenContent.servers).toHaveProperty('OtherServer');
      expect(writtenContent.servers).toHaveProperty('Sentry');
      expect(writtenContent.servers?.Sentry).toHaveProperty('type', 'http');

      expect(clack.log.success).toHaveBeenCalledWith(
        'Updated .vscode/mcp.json',
      );
    });

    it('should update existing Claude Code config file', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('claudeCode');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const existingConfig = JSON.stringify({
        mcpServers: {
          OtherServer: {
            url: 'https://other.example.com',
          },
        },
      });

      const mockReadFile = vi.fn().mockResolvedValue(existingConfig);
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await offerProjectScopedMcpConfig();

      const writtenContent = JSON.parse(
        mockWriteFile.mock.calls[0][1] as string,
      ) as ConfigContent;
      expect(writtenContent.mcpServers).toHaveProperty('OtherServer');
      expect(writtenContent.mcpServers).toHaveProperty('Sentry');

      expect(clack.log.success).toHaveBeenCalledWith('Updated .mcp.json');
    });

    it('should handle file write errors gracefully for Cursor', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('cursor');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const mockReadFile = vi
        .fn()
        .mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi
        .fn()
        .mockRejectedValue(new Error('Permission denied'));
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await expect(offerProjectScopedMcpConfig()).resolves.toBeUndefined();

      expect(clack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write MCP config automatically'),
      );

      expect(clackUtils.showCopyPasteInstructions).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: path.join('.cursor', 'mcp.json'),
          codeSnippet: expect.stringContaining('mcpServers') as string,
          hint: 'create the file if it does not exist',
        }),
      );
    });

    it('should handle file write errors gracefully for VS Code', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('vscode');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const mockReadFile = vi
        .fn()
        .mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi
        .fn()
        .mockRejectedValue(new Error('Permission denied'));
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await expect(offerProjectScopedMcpConfig()).resolves.toBeUndefined();

      expect(clackUtils.showCopyPasteInstructions).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: path.join('.vscode', 'mcp.json'),
          codeSnippet: expect.stringContaining('servers') as string,
          hint: 'create the file if it does not exist',
        }),
      );
    });

    it('should handle file write errors gracefully for Claude Code', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('claudeCode');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const mockReadFile = vi
        .fn()
        .mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi
        .fn()
        .mockRejectedValue(new Error('Permission denied'));
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await expect(offerProjectScopedMcpConfig()).resolves.toBeUndefined();

      expect(clackUtils.showCopyPasteInstructions).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: '.mcp.json',
          codeSnippet: expect.stringContaining('mcpServers') as string,
          hint: 'create the file if it does not exist',
        }),
      );
    });

    it('should handle update errors and show copy-paste instructions', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('cursor');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      // Mock existing file and simulate write error during update
      const existingConfig = JSON.stringify({
        mcpServers: {
          OtherServer: {
            url: 'https://other.example.com',
          },
        },
      });

      const mockReadFile = vi.fn().mockResolvedValue(existingConfig);
      const mockWriteFile = vi
        .fn()
        .mockRejectedValue(new Error('Write failed during update'));
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await expect(offerProjectScopedMcpConfig()).resolves.toBeUndefined();

      expect(clack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write MCP config automatically'),
      );

      expect(clackUtils.showCopyPasteInstructions).toHaveBeenCalled();
    });

    it('should handle mkdirSync errors', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('cursor');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const mockReadFile = vi
        .fn()
        .mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdirSync = vi.fn().mockImplementation(() => {
        throw new Error('Permission denied');
      });

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await expect(offerProjectScopedMcpConfig()).resolves.toBeUndefined();

      expect(clack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write MCP config automatically'),
      );

      expect(clackUtils.showCopyPasteInstructions).toHaveBeenCalled();
    });

    it('should create config with empty servers/mcpServers when existing config lacks them', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('vscode');
      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const existingConfig = JSON.stringify({
        otherProperty: 'value',
      });

      const mockReadFile = vi.fn().mockResolvedValue(existingConfig);
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await offerProjectScopedMcpConfig();

      const writtenContent = JSON.parse(
        mockWriteFile.mock.calls[0][1] as string,
      ) as ConfigContent;
      expect(writtenContent).toHaveProperty('otherProperty', 'value');
      expect(writtenContent).toHaveProperty('servers');
      expect(writtenContent.servers).toHaveProperty('Sentry');

      expect(clack.log.success).toHaveBeenCalledWith(
        'Updated .vscode/mcp.json',
      );
    });

    it('should show config for JetBrains IDEs with clipboard copy', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('jetbrains')
        .mockResolvedValueOnce(true); // For the continue prompt

      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      // Mock clipboard copy
      const mockSpawn = vi.fn().mockReturnValue({
        stdin: {
          write: vi.fn(),
          end: vi.fn(),
        },
        on: vi.fn((event, callback: (code?: number) => void) => {
          if (event === 'close') callback(0);
        }),
      });
      vi.spyOn(childProcess, 'spawn').mockImplementation(mockSpawn);

      // Mock console.log to capture output
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await offerProjectScopedMcpConfig();

      expect(clack.log.info).toHaveBeenCalledWith(
        expect.stringContaining('JetBrains IDEs'),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('mcpServers'),
      );

      expect(clack.log.success).toHaveBeenCalledWith(
        'Configuration copied to clipboard!',
      );

      consoleSpy.mockRestore();
    });

    it('should show generic config for unsupported IDEs with clipboard copy', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('other')
        .mockResolvedValueOnce(true); // For the continue prompt

      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      // Mock clipboard copy failure to test fallback
      const mockSpawn = vi.fn().mockReturnValue({
        stdin: {
          write: vi.fn(),
          end: vi.fn(),
        },
        on: vi.fn((event, callback: () => void) => {
          if (event === 'error') callback();
        }),
      });
      vi.spyOn(childProcess, 'spawn').mockImplementation(mockSpawn);

      // Mock console.log to capture output
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await offerProjectScopedMcpConfig();

      expect(clack.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Generic MCP configuration'),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('mcpServers'),
      );

      // Since clipboard copy failed, user should be prompted to copy manually
      expect(clack.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Copy the configuration above manually',
        }),
      );

      consoleSpy.mockRestore();
    });

    it('should handle clipboard copy failure gracefully for JetBrains', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('jetbrains')
        .mockResolvedValueOnce(true); // For manual copy prompt

      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      // Mock clipboard copy to throw error
      const mockSpawn = vi.fn().mockImplementation(() => {
        throw new Error('Clipboard not available');
      });
      vi.spyOn(childProcess, 'spawn').mockImplementation(mockSpawn);

      // Mock console.log to capture output
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await offerProjectScopedMcpConfig();

      // Should show manual copy prompt when clipboard fails
      expect(clack.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Copy the configuration above manually',
        }),
      );

      consoleSpy.mockRestore();
    });

    it('should show MCP explanation when user selects "What is MCP?"', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce('explain') // User selects "What is MCP?"
        .mockResolvedValueOnce(true) // User selects "Yes" after explanation
        .mockResolvedValueOnce('cursor'); // User selects Cursor

      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      const mockReadFile = vi
        .fn()
        .mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdirSync = vi.fn();

      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await offerProjectScopedMcpConfig();

      // Should show MCP explanation
      expect(clack.log.info).toHaveBeenCalledWith(
        expect.stringContaining('What is MCP'),
      );

      expect(clack.log.info).toHaveBeenCalledWith(
        expect.stringContaining('AI assistants'),
      );

      expect(clack.log.info).toHaveBeenCalledWith(
        expect.stringContaining('https://docs.sentry.io/product/sentry-mcp/'),
      );

      // Should ask again after explanation
      expect(clack.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Would you like to configure MCP for your IDE now?',
        }),
      );

      // Should proceed with normal flow
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should exit if user declines after MCP explanation', async () => {
      const { clack, clackUtils } = await getMocks();

      vi.mocked(clack.select)
        .mockResolvedValueOnce('explain') // User selects "What is MCP?"
        .mockResolvedValueOnce(false); // User selects "No" after explanation

      vi.mocked(clackUtils.abortIfCancelled).mockImplementation(
        (value: unknown) => Promise.resolve(value),
      );

      await offerProjectScopedMcpConfig();

      // Should show MCP explanation
      expect(clack.log.info).toHaveBeenCalledWith(
        expect.stringContaining('What is MCP'),
      );

      // Should ask again after explanation
      expect(clack.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Would you like to configure MCP for your IDE now?',
        }),
      );

      // Should NOT proceed with editor selection
      expect(clack.select).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Which editor do you want to configure?',
        }),
      );
    });
  });
});
