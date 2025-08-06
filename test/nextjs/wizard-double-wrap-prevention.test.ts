import { describe, it, expect } from 'vitest';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { builders, parseModule } from 'magicast';
import { getWithSentryConfigOptionsTemplate } from '../../src/nextjs/templates';
import {
  unwrapSentryConfigAst,
  wrapWithSentryConfig,
} from '../../src/nextjs/utils';

describe('Next.js wizard double wrap prevention', () => {
  const mockWithSentryConfigOptionsTemplate =
    getWithSentryConfigOptionsTemplate({
      orgSlug: 'test-org',
      projectSlug: 'test-project',
      selfHosted: false,
      sentryUrl: 'https://sentry.io',
      tunnelRoute: false,
    });

  describe('unwrapSentryConfigAst utility function', () => {
    describe('AST-based expression unwrapping', () => {
      it('keeps code without withSentryConfig', () => {
        const mod = parseModule('export default nextConfig');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
        const originalAst = mod.exports.default.$ast;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = unwrapSentryConfigAst(originalAst);
        expect(result).toBe(originalAst);
      });

      it('should handle plain object literal exports', () => {
        const mod = parseModule(
          `export default { nextConfig: { randomValue: true } }`,
        );
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
        const originalAst = mod.exports.default.$ast;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = unwrapSentryConfigAst(originalAst);

        expect(result).toBe(originalAst);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.type).toBe('ObjectExpression');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.properties).toHaveLength(1);
      });

      it('should unwrap withSentryConfig with options', () => {
        const mod = parseModule(
          'export default withSentryConfig(nextConfig, { org: "test" })',
        );
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
        const wrappedAst = mod.exports.default.$ast;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = unwrapSentryConfigAst(wrappedAst);

        // The result should be the first argument (nextConfig)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result?.type).toBe('Identifier');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result?.name).toBe('nextConfig');
      });

      it('should unwrap withSentryConfig without options', () => {
        const mod = parseModule('export default withSentryConfig(nextConfig)');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
        const wrappedAst = mod.exports.default.$ast;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = unwrapSentryConfigAst(wrappedAst);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.type).toBe('Identifier');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.name).toBe('nextConfig');
      });

      it('should handle nested withSentryConfig calls', () => {
        const mod = parseModule(
          'export default withSentryConfig(withSentryConfig(nextConfig, { org: "inner" }), { org: "outer" })',
        );
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
        const wrappedAst = mod.exports.default.$ast;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = unwrapSentryConfigAst(wrappedAst);

        // Should unwrap one level and return the inner withSentryConfig call
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.type).toBe('CallExpression');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.callee.name).toBe('withSentryConfig');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.arguments[0].name).toBe('nextConfig');
      });

      it('should handle complex expressions', () => {
        const mod = parseModule(
          'export default withSentryConfig(someComplexExpression.withMethods())',
        );
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
        const wrappedAst = mod.exports.default.$ast;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = unwrapSentryConfigAst(wrappedAst);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.type).toBe('CallExpression');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.callee.type).toBe('MemberExpression');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.callee.object.name).toBe('someComplexExpression');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.callee.property.name).toBe('withMethods');
      });

      it('should handle object literals', () => {
        const mod = parseModule(
          'export default withSentryConfig({ next: "config", obj: { next: "nested" } }, { org: "test" })',
        );
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
        const wrappedAst = mod.exports.default.$ast;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = unwrapSentryConfigAst(wrappedAst);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.type).toBe('ObjectExpression');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.properties).toHaveLength(2);
      });

      it('should return unchanged if not a withSentryConfig call', () => {
        const mod = parseModule('export default someOtherFunction(nextConfig)');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
        const originalAst = mod.exports.default.$ast;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = unwrapSentryConfigAst(originalAst);

        expect(result).toBe(originalAst);
      });
    });
  });

  describe('MJS/TS files', () => {
    it('should unwrap existing withSentryConfig and re-wrap with new config using AST', () => {
      const existingMjsContent = `import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {};

export default withSentryConfig(nextConfig, {
  org: "old-org",
  project: "old-project",
});`;

      const mod = parseModule(existingMjsContent);

      // Simulate the wizard's AST-based approach
      mod.imports.$add({
        from: '@sentry/nextjs',
        imported: 'withSentryConfig',
        local: 'withSentryConfig',
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
      const originalAst = mod.exports.default.$ast;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
      mod.exports.default.$ast = unwrapSentryConfigAst(originalAst);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mod.exports.default = wrapWithSentryConfig(
        mod.exports.default,
        mockWithSentryConfigOptionsTemplate,
      );

      const newCode = mod.generate().code;

      // Verify only one withSentryConfig call exists
      const withSentryConfigMatches = newCode.match(/withSentryConfig\s*\(/g);
      expect(withSentryConfigMatches).toHaveLength(1);

      expect(newCode).toContain('test-org');
      expect(newCode).toContain('test-project');
      expect(newCode).not.toContain('"old-org"');
      expect(newCode).not.toContain('"old-project"');
    });

    it('should handle complex nested configurations using AST', () => {
      const existingMjsContent = `import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = { experimental: { appDir: true } };

export default withSentryConfig(
  withSentryConfig(nextConfig, { org: "nested-org" }),
  { org: "outer-org" }
);`;

      const mod = parseModule(existingMjsContent);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
      let currentAst = mod.exports.default.$ast;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      currentAst = unwrapSentryConfigAst(currentAst);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(currentAst.type).toBe('CallExpression');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(currentAst.callee.name).toBe('withSentryConfig');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      currentAst = unwrapSentryConfigAst(currentAst);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(currentAst.type).toBe('Identifier');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(currentAst.name).toBe('nextConfig');
    });

    it('should handle simple export without existing withSentryConfig using AST', () => {
      const simpleMjsContent = `const nextConfig = {};

export default nextConfig;`;

      const mod = parseModule(simpleMjsContent);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
      const originalAst = mod.exports.default.$ast;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const unwrappedAst = unwrapSentryConfigAst(originalAst);
      expect(unwrappedAst).toBe(originalAst);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(unwrappedAst.type).toBe('Identifier');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(unwrappedAst.name).toBe('nextConfig');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mod.exports.default = wrapWithSentryConfig(
        mod.exports.default,
        mockWithSentryConfigOptionsTemplate,
      );

      const newCode = mod.generate().code;

      // Should have exactly one withSentryConfig call
      const withSentryConfigMatches = newCode.match(/withSentryConfig\s*\(/g);
      expect(withSentryConfigMatches).toHaveLength(1);
    });

    it('should handle withSentryConfig(nextConfig) without options using AST', () => {
      const existingMjsContent = `import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {};

export default withSentryConfig(nextConfig);`;

      const mod = parseModule(existingMjsContent);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
      const originalAst = mod.exports.default.$ast;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(originalAst.type).toBe('CallExpression');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(originalAst.callee.name).toBe('withSentryConfig');

      // Unwrap to get the base config and assign it back
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
      mod.exports.default.$ast = unwrapSentryConfigAst(originalAst);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mod.exports.default.$ast.type).toBe('Identifier');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mod.exports.default.$ast.name).toBe('nextConfig');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mod.exports.default = builders.functionCall(
        'withSentryConfig',
        mod.exports.default,
        builders.raw(mockWithSentryConfigOptionsTemplate),
      );

      const newCode = mod.generate().code;

      // Should have exactly one withSentryConfig call
      const withSentryConfigMatches = newCode.match(/withSentryConfig\s*\(/g);
      expect(withSentryConfigMatches).toHaveLength(1);

      expect(newCode).not.toContain('withSentryConfig(withSentryConfig(');
      expect(newCode).toMatch(/withSentryConfig\s*\(\s*nextConfig\s*,/);
    });
  });
});
