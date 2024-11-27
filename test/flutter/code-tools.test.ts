//@ts-ignore
import { getLastImportLineLocation } from '../../src/flutter/code-tools';

describe('code-tools', () => {
  describe('getLastImportLineLocation', () => {
    it('returns proper line index', () => {
      const code = `import 'foo:bar';\n` + `//<insert-location>\n` + `class X {}`;
      expect(getLastImportLineLocation(code)).toBe(
        code.indexOf('//<insert-location>'),
      );
    });

    it('returns proper line index when alias import is used', () => {
      const code =
        `import 'package:my_library/utils.dart' as utils;\n` + `//<insert-location>\n` + `class X {}`;
      expect(getLastImportLineLocation(code)).toBe(
        code.indexOf('//<insert-location>'),
      );
    });

    it('returns proper line index when specific parts import is used', () => {
      const code = `import 'dart:math' show pi, sin;\n` + `//<insert-location>\n` + `class X {}`;
      expect(getLastImportLineLocation(code)).toBe(
        code.indexOf('//<insert-location>'),
      );
    });

    it('returns proper line index when hide import is used', () => {
      const code =
        `import 'dart:math' hide Random;\n` + `//<insert-location>\n` + `class X {}`;
      expect(getLastImportLineLocation(code)).toBe(
        code.indexOf('//<insert-location>'),
      );
    });

    it('returns proper line index when deferred import is used', () => {
      const code =
        `import 'package:my_library/large_library.dart' deferred as largeLibrary;\n` + `//<insert-location>\n` + `class X {}`;
      expect(getLastImportLineLocation(code)).toBe(
        code.indexOf('//<insert-location>'),
      );
    });

    it('returns proper line index when multiple imports (with newlines) are present', () => {
      const code =
        `import 'foo:bar';\n` +
        `import 'package:my_library/utils.dart' as utils;\n` +
        `import 'dart:math' show pi, sin;\n` +
        `import 'dart:math' hide Random;\n` +
        `\n` +
        `import 'package:my_library/large_library.dart' deferred as largeLibrary;\n` +
        `//<insert-location>\n` +
        `class X {}`;
      expect(getLastImportLineLocation(code)).toBe(
        code.indexOf('//<insert-location>'),
      );
    });
  });
});
