import * as fs from 'fs';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;

const b = recast.types.builders;

/**
 * Checks if a file where we don't know its concrete file type yet exists
 * and returns the full path to the file with the correct file type.
 */
export function findFile(
  filePath: string,
  fileTypes: string[] = ['.js', '.ts', '.mjs', '.cjs'],
): string | undefined {
  return fileTypes
    .map((type) => `${filePath}${type}`)
    .find((file) => fs.existsSync(file));
}

/**
 * checks for require('@sentry/*') syntax
 */
export function hasSentryContent(program: t.Program): boolean {
  let foundSentry: boolean | undefined = false;
  recast.visit(program, {
    visitStringLiteral(path) {
      foundSentry = foundSentry || path.node.value.startsWith('@sentry/');
      this.traverse(path);
    },
    visitLiteral(path) {
      foundSentry =
        foundSentry || path.node.value?.toString().startsWith('@sentry/');
      this.traverse(path);
    },
  });

  return !!foundSentry;
}

/**
 * Searches for a property of an ObjectExpression by name
 *
 * @param object the ObjectExpression to search in
 * @param name the name of the property to search for
 *
 * @returns the property if it exists
 */
export function getObjectProperty(
  object: t.ObjectExpression,
  name: string,
): t.Property | undefined {
  return object.properties.find((p): p is t.Property => {
    const isObjectProp = p.type === 'Property' || p.type === 'ObjectProperty';

    if (!isObjectProp) {
      return false;
    }

    const hasMatchingLiteralKey =
      isObjectProp &&
      (p.key.type === 'Literal' || p.key.type === 'StringLiteral') &&
      p.key.value === name;

    if (hasMatchingLiteralKey) {
      return true;
    }

    // has matching identifier key
    return isObjectProp && p.key.type === 'Identifier' && p.key.name === name;
  });
}

/**
 * Attempts to find a property of an ObjectExpression by name. If it doesn't exist,
 * the property will be added to the ObjectExpression with the provided default value.
 *
 * @param object the parent object expression to search in
 * @param name the name of the property to search for
 * @param defaultValue the default value to set if the property doesn't exist
 *
 * @returns the
 */
export function getOrSetObjectProperty(
  object: t.ObjectExpression,
  name: string,
  defaultValue:
    | t.Literal
    | t.BooleanLiteral
    | t.StringLiteral
    | t.ObjectExpression,
): t.Property {
  const existingProperty = getObjectProperty(object, name);

  if (existingProperty) {
    return existingProperty;
  }

  const newProperty = b.property.from({
    kind: 'init',
    key: b.stringLiteral(name),
    value: defaultValue,
  });

  object.properties.push(newProperty);

  return newProperty;
}

/**
 * Sets a property of an ObjectExpression if it exists, otherwise adds it
 * to the ObjectExpression. Optionally, a comment can be added to the
 * property.
 *
 * @param object the ObjectExpression to set the property on
 * @param name the name of the property to set
 * @param value  the value of the property to set
 * @param comment (optional) a comment to add to the property
 */
export function setOrUpdateObjectProperty(
  object: t.ObjectExpression,
  name: string,
  value: t.Literal | t.BooleanLiteral | t.StringLiteral | t.ObjectExpression,
  comment?: string,
) {
  const newComments =
    comment &&
    comment.split('\n').map((c) => b.commentLine(` ${c}`, true, false));

  const existingProperty = getObjectProperty(object, name);

  if (existingProperty) {
    existingProperty.value = value;
    if (newComments) {
      existingProperty.comments = [
        ...(existingProperty?.comments || []),
        ...newComments,
      ];
    }
  } else {
    object.properties.push(
      b.objectProperty.from({
        key: b.stringLiteral(name),
        value,
        ...(newComments && {
          comments: newComments,
        }),
      }),
    );
  }
}

type JsonCParseResult =
  | {
      jsonObject: t.ObjectExpression;
      ast: t.Program;
    }
  | {
      jsonObject: undefined;
      ast: undefined;
    };

/**
 * Parses a JSON string with (potential) comments (JSON-C) and returns the JS AST
 * that can be walked and modified with recast like a normal JS AST.
 *
 * This is done by wrapping the JSON-C string in parentheses, thereby making it
 * a JS `Program` with an `ExpressionStatement` as its body. The expression is then
 * extracted from the AST and returned alongside the AST.
 *
 * To preserve as much original formatting as possible, the returned `ast`
 * property should be passed to {@link `printJsonC`} to get the JSON-C string back.
 *
 * If the input is not valid JSON-C, the result will be undefined.
 *
 * @see {@link JsonCParseResult}
 *
 * @param jsonString a JSON-C string
 *
 * @returns a {@link JsonCParseResult}, containing either the JSON-C object and the AST or undefined in both cases
 */
export function parseJsonC(jsonString: string): JsonCParseResult {
  try {
    const jsTsConfig = `(${jsonString})`;
    // no idea why recast returns any here, this is dumb :/
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const ast = recast.parse(jsTsConfig.toString()).program as t.Program;

    const jsonObject =
      (ast.body[0].type === 'ExpressionStatement' &&
        ast.body[0].expression.type === 'ObjectExpression' &&
        ast.body[0].expression) ||
      undefined;

    if (jsonObject) {
      return { jsonObject, ast };
    }
  } catch {
    /* empty */
  }
  return { jsonObject: undefined, ast: undefined };
}

/**
 * Takes the AST of a parsed JSON-C "program" and returns the JSON-C string without
 * any of the temporary JS wrapper code that was previously applied.
 *
 * Only use this in conjunction with {@link `parseJsonC`}
 *
 * @param ast the `ast` returned from {@link `parseJsonC`}
 *
 * @returns the JSON-C string
 */
export function printJsonC(ast: t.Program): string {
  const js = recast.print(ast).code;
  return js.substring(1, js.length - 1);
}

/**
 * Walks the program body and returns index of the last variable assignment initialized by require statement.
 * Only counts top level require statements.
 *
 * @returns index of the last `const foo = require('bar');` statement
 */
export function getLastRequireIndex(program: t.Program): number {
  let lastRequireIdex = 0;
  program.body.forEach((s, i) => {
    if (
      s.type === 'VariableDeclaration' &&
      s.declarations[0].type === 'VariableDeclarator' &&
      s.declarations[0].init !== null &&
      typeof s.declarations[0].init !== 'undefined' &&
      s.declarations[0].init.type === 'CallExpression' &&
      s.declarations[0].init.callee.type === 'Identifier' &&
      s.declarations[0].init.callee.name === 'require'
    ) {
      lastRequireIdex = i;
    }
  });
  return lastRequireIdex;
}

/**
 * Walks the statements and removes require statements which first argument includes the predicate.
 * Only removes top level require statements like `const foo = require('bar');`
 *
 * @returns True if any require statement was removed.
 */
export function removeRequire(program: t.Program, predicate: string): boolean {
  let removedAtLeastOne = false;
  program.body = program.body.filter((s) => {
    if (
      s.type === 'VariableDeclaration' &&
      s.declarations[0].type === 'VariableDeclarator' &&
      s.declarations[0].init !== null &&
      typeof s.declarations[0].init !== 'undefined' &&
      s.declarations[0].init.type === 'CallExpression' &&
      s.declarations[0].init.callee.type === 'Identifier' &&
      s.declarations[0].init.callee.name === 'require' &&
      s.declarations[0].init.arguments[0].type === 'StringLiteral' &&
      s.declarations[0].init.arguments[0].value.includes(predicate)
    ) {
      removedAtLeastOne = true;
      return false;
    }
    return true;
  });
  return removedAtLeastOne;
}
