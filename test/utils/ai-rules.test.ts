import { describe, it, expect } from 'vitest';
import {
  getAiRulesFilePath,
  getAiRulesFileContent,
  type AIEditorType,
  type AIRulesConfig,
} from '../../src/utils/ai-rules';

describe('AI Rules', () => {
  describe('getAiRulesFilePath', () => {
    it('returns correct path for Cursor', () => {
      expect(getAiRulesFilePath('cursor')).toBe('.cursorrules');
    });

    it('returns correct path for VS Code', () => {
      expect(getAiRulesFilePath('vscode')).toBe('.github/instructions/sentryrules.md');
    });

    it('returns correct path for Claude', () => {
      expect(getAiRulesFilePath('claude')).toBe('sentryrules.md');
    });
  });

  describe('getAiRulesFileContent', () => {
    const config: AIRulesConfig = {
      frameworkName: 'TestFramework',
      frameworkSpecificContent: '- Test specific content',
    };

    it('includes framework name in content', () => {
      const content = getAiRulesFileContent('claude', config);
      expect(content).toContain('TestFramework');
    });

    it('includes framework-specific content', () => {
      const content = getAiRulesFileContent('claude', config);
      expect(content).toContain('- Test specific content');
    });

    it('includes base Sentry examples', () => {
      const content = getAiRulesFileContent('claude', config);
      expect(content).toContain('Sentry.captureException');
      expect(content).toContain('Sentry.startSpan');
      expect(content).toContain('logger.trace');
    });

    it('adds Cursor-specific header for Cursor editor', () => {
      const content = getAiRulesFileContent('cursor', config);
      expect(content.startsWith('You are an expert at Sentry integration patterns')).toBe(true);
    });

    it('returns markdown content for VS Code', () => {
      const content = getAiRulesFileContent('vscode', config);
      expect(content).toContain('# Exception Catching');
      expect(content.startsWith('You are an expert')).toBe(false);
    });

    it('returns markdown content for Claude', () => {
      const content = getAiRulesFileContent('claude', config);
      expect(content).toContain('# Exception Catching');
      expect(content.startsWith('You are an expert')).toBe(false);
    });

    it('uses correct import statement for framework', () => {
      const content = getAiRulesFileContent('claude', config);
      expect(content).toContain('@sentry/testframework');
    });

    it('uses correct import for Next.js', () => {
      const nextConfig: AIRulesConfig = {
        frameworkName: 'Next.js',
        frameworkSpecificContent: '',
      };
      const content = getAiRulesFileContent('claude', nextConfig);
      expect(content).toContain('@sentry/nextjs');
    });
  });
});