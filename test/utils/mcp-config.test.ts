import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { offerProjectScopedMcpConfig } from '../../src/utils/mcp-config';

// Mock types for better type safety
type PromptMocks = {
  confirm: Mock;
  select: Mock;
  isCancel: Mock;
  cancel: Mock;
  log: {
    success: Mock;
    info: Mock;
    warn: Mock;
  };
};

type ClackMocks = {
  abortIfCancelled: Mock;
  showCopyPasteInstructions: Mock;
};

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

describe('mcp-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('offerProjectScopedMcpConfig', () => {
    it('should return early if user declines MCP config', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValue(false);
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));

      await offerProjectScopedMcpConfig();

      expect(prompts.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Optionally add a project-scoped MCP server configuration') as string,
          options: expect.arrayContaining([
            expect.objectContaining({ value: true }),
            expect.objectContaining({ value: false }),
          ]) as unknown[],
          initialValue: true,
        }),
      );
    });

    it('should configure for Cursor when selected', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('cursor');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
      const mockReadFile = vi.fn().mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdirSync = vi.fn();
      
      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await offerProjectScopedMcpConfig();

      expect(prompts.select).toHaveBeenCalledTimes(2);
      expect(prompts.select).toHaveBeenNthCalledWith(
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
      
      expect(prompts.log.success).toHaveBeenCalledWith(
        expect.stringContaining('.cursor/mcp.json'),
      );
      expect(prompts.log.success).toHaveBeenCalledWith(
        'Added project-scoped Sentry MCP configuration.',
      );
      expect(prompts.log.info).toHaveBeenCalledWith(
        expect.stringContaining('reload your editor'),
      );
    });

    it('should configure for VS Code when selected', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('vscode');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
      const mockReadFile = vi.fn().mockRejectedValue(new Error('File not found'));
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
      
      expect(prompts.log.success).toHaveBeenCalledWith(
        expect.stringContaining('.vscode/mcp.json'),
      );
    });

    it('should configure for Claude Code when selected', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('claudeCode');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
      const mockReadFile = vi.fn().mockRejectedValue(new Error('File not found'));
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
      
      expect(prompts.log.success).toHaveBeenCalledWith(
        expect.stringContaining('.mcp.json'),
      );
    });

    it('should update existing Cursor config file', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('cursor');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
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
      
      const writtenContent = JSON.parse(mockWriteFile.mock.calls[0][1] as string) as ConfigContent;
      expect(writtenContent.mcpServers).toHaveProperty('OtherServer');
      expect(writtenContent.mcpServers).toHaveProperty('Sentry');
      
      expect(prompts.log.success).toHaveBeenCalledWith('Updated .cursor/mcp.json');
    });

    it('should update existing VS Code config file', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('vscode');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
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

      const writtenContent = JSON.parse(mockWriteFile.mock.calls[0][1] as string) as ConfigContent;
      expect(writtenContent.servers).toHaveProperty('OtherServer');
      expect(writtenContent.servers).toHaveProperty('Sentry');
      expect(writtenContent.servers?.Sentry).toHaveProperty('type', 'http');
      
      expect(prompts.log.success).toHaveBeenCalledWith('Updated .vscode/mcp.json');
    });

    it('should update existing Claude Code config file', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('claudeCode');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
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

      const writtenContent = JSON.parse(mockWriteFile.mock.calls[0][1] as string) as ConfigContent;
      expect(writtenContent.mcpServers).toHaveProperty('OtherServer');
      expect(writtenContent.mcpServers).toHaveProperty('Sentry');
      
      expect(prompts.log.success).toHaveBeenCalledWith('Updated .mcp.json');
    });

    it('should handle file write errors gracefully for Cursor', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('cursor');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
      const mockReadFile = vi.fn().mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi.fn().mockRejectedValue(new Error('Permission denied'));
      const mockMkdirSync = vi.fn();
      
      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await expect(offerProjectScopedMcpConfig()).resolves.toBeUndefined();
      
      expect(prompts.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write MCP config automatically'),
      );
      
      expect(clack.showCopyPasteInstructions).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: path.join('.cursor', 'mcp.json'),
          codeSnippet: expect.stringContaining('mcpServers') as string,
          hint: 'create the file if it does not exist',
        }),
      );
    });

    it('should handle file write errors gracefully for VS Code', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('vscode');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
      const mockReadFile = vi.fn().mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi.fn().mockRejectedValue(new Error('Permission denied'));
      const mockMkdirSync = vi.fn();
      
      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await expect(offerProjectScopedMcpConfig()).resolves.toBeUndefined();
      
      expect(clack.showCopyPasteInstructions).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: path.join('.vscode', 'mcp.json'),
          codeSnippet: expect.stringContaining('servers') as string,
          hint: 'create the file if it does not exist',
        }),
      );
    });

    it('should handle file write errors gracefully for Claude Code', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('claudeCode');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
      const mockReadFile = vi.fn().mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi.fn().mockRejectedValue(new Error('Permission denied'));
      const mockMkdirSync = vi.fn();
      
      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await expect(offerProjectScopedMcpConfig()).resolves.toBeUndefined();
      
      expect(clack.showCopyPasteInstructions).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: '.mcp.json',
          codeSnippet: expect.stringContaining('mcpServers') as string,
          hint: 'create the file if it does not exist',
        }),
      );
    });

    it('should handle update errors and show copy-paste instructions', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('cursor');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
      // Mock existing file and simulate write error during update
      const existingConfig = JSON.stringify({
        mcpServers: {
          OtherServer: {
            url: 'https://other.example.com',
          },
        },
      });
      
      const mockReadFile = vi.fn().mockResolvedValue(existingConfig);
      const mockWriteFile = vi.fn().mockRejectedValue(new Error('Write failed during update'));
      const mockMkdirSync = vi.fn();
      
      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await expect(offerProjectScopedMcpConfig()).resolves.toBeUndefined();
      
      expect(prompts.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write MCP config automatically'),
      );
      
      expect(clack.showCopyPasteInstructions).toHaveBeenCalled();
    });

    it('should handle mkdirSync errors', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('cursor');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
      const mockReadFile = vi.fn().mockRejectedValue(new Error('File not found'));
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdirSync = vi.fn().mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      vi.spyOn(fs.promises, 'readFile').mockImplementation(mockReadFile);
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(mockWriteFile);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(mockMkdirSync);

      await expect(offerProjectScopedMcpConfig()).resolves.toBeUndefined();
      
      expect(prompts.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write MCP config automatically'),
      );
      
      expect(clack.showCopyPasteInstructions).toHaveBeenCalled();
    });

    it('should create config with empty servers/mcpServers when existing config lacks them', async () => {
      const prompts = await import('@clack/prompts') as unknown as PromptMocks;
      const clack = await import('../../src/utils/clack') as unknown as ClackMocks;
      
      prompts.select.mockResolvedValueOnce(true).mockResolvedValueOnce('vscode');
      clack.abortIfCancelled.mockImplementation((value: unknown) => Promise.resolve(value));
      
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

      const writtenContent = JSON.parse(mockWriteFile.mock.calls[0][1] as string) as ConfigContent;
      expect(writtenContent).toHaveProperty('otherProperty', 'value');
      expect(writtenContent).toHaveProperty('servers');
      expect(writtenContent.servers).toHaveProperty('Sentry');
      
      expect(prompts.log.success).toHaveBeenCalledWith('Updated .vscode/mcp.json');
    });
  });
});