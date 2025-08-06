import { describe, it, expect } from 'vitest';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { builders, generateCode, parseModule } from 'magicast';
import { getWithSentryConfigOptionsTemplate } from '../../src/nextjs/templates';
import { unwrapSentryConfigExpression } from '../../src/nextjs/utils';

describe('Next.js wizard double wrap prevention', () => {
  const mockWithSentryConfigOptionsTemplate =
    getWithSentryConfigOptionsTemplate({
      orgSlug: 'test-org',
      projectSlug: 'test-project',
      selfHosted: false,
      sentryUrl: 'https://sentry.io',
      tunnelRoute: false,
    });

  describe('unwrapSentryConfigExpression utility function', () => {
    describe('MJS/TS expression unwrapping', () => {
      it('keeps code without withSentryConfig', () => {
        const input = `const nextConfig = { /* config options here */ }; export default nextConfig`;
        const result = unwrapSentryConfigExpression(input);
        expect(result).toBe(input);
      });

      it('should unwrap withSentryConfig with options', () => {
        const input = 'withSentryConfig(nextConfig, { org: "test" })';
        const result = unwrapSentryConfigExpression(input);
        expect(result).toBe('nextConfig');
      });

      it('should unwrap withSentryConfig without options', () => {
        const input = 'withSentryConfig(nextConfig)';
        const result = unwrapSentryConfigExpression(input);
        expect(result).toBe('nextConfig');
      });

      it('should unwrap multiple-wrapped withSentryConfig without options', () => {
        const input = 'withSentryConfig(withSentryConfig(nextConfig))';
        const result = unwrapSentryConfigExpression(input);
        expect(result).toBe('withSentryConfig(nextConfig)');
      });

      it('should handle nested withSentryConfig calls', () => {
        const input =
          'withSentryConfig(withSentryConfig(nextConfig, { dsn: "inner-dsn", sampleRate: 1.0 }), { org: "outer" })';
        const result = unwrapSentryConfigExpression(input);
        expect(result).toBe(
          'withSentryConfig(nextConfig, { dsn: "inner-dsn", sampleRate: 1.0 })',
        );
      });

      it('should handle nested withSentryConfig calls with object option', () => {
        const input =
          'withSentryConfig(withSentryConfig(nextConfig, { dsn: "inner-dsn", obj: { test: "hey" } }), { org: "outer" })';
        const result = unwrapSentryConfigExpression(input);
        expect(result).toBe(
          'withSentryConfig(nextConfig, { dsn: "inner-dsn", obj: { test: "hey" } })',
        );
      });

      it('should handle complex expressions', () => {
        const input = 'withSentryConfig(someComplexExpression.withMethods())';
        const result = unwrapSentryConfigExpression(input);
        expect(result).toBe('someComplexExpression.withMethods()');
      });

      it('should handle expressions with whitespace', () => {
        const input = 'withSentryConfig( nextConfig , { org: "test" })';
        const result = unwrapSentryConfigExpression(input);
        expect(result).toBe('nextConfig');
      });

      it('should return unchanged if no withSentryConfig present', () => {
        const input = 'nextConfig';
        const result = unwrapSentryConfigExpression(input);
        expect(result).toBe('nextConfig');
      });

      it('should handle the exact reported case', () => {
        const input = 'withSentryConfig(nextConfig)';
        const result = unwrapSentryConfigExpression(input);
        expect(result).toBe('nextConfig');
      });
    });
  });

  describe('MJS/TS files', () => {
    it('should unwrap existing withSentryConfig and re-wrap with new config', () => {
      const existingMjsContent = `import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {};

export default withSentryConfig(nextConfig, {
  org: "old-org",
  project: "old-project",
});`;

      const mod = parseModule(existingMjsContent);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      let expressionToWrap = generateCode(mod.exports.default.$ast).code;

      expressionToWrap = unwrapSentryConfigExpression(expressionToWrap);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mod.exports.default = builders.raw(`withSentryConfig(
      ${expressionToWrap},
      ${mockWithSentryConfigOptionsTemplate}
)`);

      const newCode = mod.generate().code;

      const withSentryConfigMatches = newCode.match(/withSentryConfig\s*\(/g);
      expect(withSentryConfigMatches).toHaveLength(1);

      expect(newCode).toContain('test-org');
      expect(newCode).toContain('test-project');
      expect(newCode).not.toContain('"old-org"');
      expect(newCode).not.toContain('"old-project"');
    });

    it('should handle complex nested configurations', () => {
      const existingMjsContent = `import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = { experimental: { appDir: true } };

export default withSentryConfig(
  withSentryConfig(nextConfig, { org: "nested-org" }),
  { org: "outer-org" }
);`;

      const mod = parseModule(existingMjsContent);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      let expressionToWrap = generateCode(mod.exports.default.$ast).code;

      // Use the utility function to unwrap once - extracts the outermost-wrapped expression first
      expressionToWrap = unwrapSentryConfigExpression(expressionToWrap);
      expect(expressionToWrap).toContain('withSentryConfig(nextConfig');

      // If we extract again (simulating multiple runs) - should eventually get to the base config
      expressionToWrap = unwrapSentryConfigExpression(expressionToWrap);
      expect(expressionToWrap).toBe('nextConfig');
    });

    it('should handle simple export without existing withSentryConfig', () => {
      const simpleMjsContent = `const nextConfig = {};

export default nextConfig;`;

      const mod = parseModule(simpleMjsContent);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      const expressionToWrap = generateCode(mod.exports.default.$ast).code;

      // Should not try to unwrap when there's no existing wrap
      expect(expressionToWrap).toBe('nextConfig');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mod.exports.default = builders.raw(`withSentryConfig(
      ${expressionToWrap},
      ${mockWithSentryConfigOptionsTemplate}
)`);

      const newCode = mod.generate().code;

      // Should have exactly one withSentryConfig call
      const withSentryConfigMatches = newCode.match(/withSentryConfig\s*\(/g);
      expect(withSentryConfigMatches).toHaveLength(1);
    });

    it('should handle withSentryConfig(nextConfig) without options', () => {
      const existingMjsContent = `import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {};

export default withSentryConfig(nextConfig);`;

      const mod = parseModule(existingMjsContent);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      let expressionToWrap = generateCode(mod.exports.default.$ast).code;

      expect(expressionToWrap).toBe('withSentryConfig(nextConfig)');

      expressionToWrap = unwrapSentryConfigExpression(expressionToWrap);

      expect(expressionToWrap).toBe('nextConfig');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mod.exports.default = builders.raw(`withSentryConfig(
      ${expressionToWrap},
      ${mockWithSentryConfigOptionsTemplate}
)`);

      const newCode = mod.generate().code;

      // Should have exactly one withSentryConfig call
      const withSentryConfigMatches = newCode.match(/withSentryConfig\s*\(/g);
      expect(withSentryConfigMatches).toHaveLength(1);

      expect(newCode).not.toContain('withSentryConfig(withSentryConfig(');
      expect(newCode).toMatch(/withSentryConfig\s*\(\s*nextConfig\s*,/);
    });
  });
});
