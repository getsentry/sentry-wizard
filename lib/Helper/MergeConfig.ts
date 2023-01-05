import * as fs from 'fs';
import * as ts from 'ts';

// checks if statement uses module.exports format
function isModuleExport(statement: ts.Statement): boolean {
  if (statement.kind !== ts.SyntaxKind.ExpressionStatement) {
    return false;
  }
  if (!statement.expression) {
    return false;
  }
  const { left } = statement.expression;
  // check if this is module.exports
  return (
    left.expression?.escapedText === 'module' &&
    left.name?.escapedText === 'exports'
  );
}

// checks if statement uses default export format
function isDefaultExport(statement: ts.Statement): boolean {
  if (statement.kind !== ts.SyntaxKind.ExportAssignment) {
    return false;
  }
  if (!statement.expression) {
    return false;
  }
  return true;
}

// finds the the source variable name from the statement
function getSourceVariableName(
  statement: ts.Statement,
  sourceText: string,
): { variableName: string | undefined; text: string | undefined } {
  let sourceVariableName, declarationText;
  if (isModuleExport(statement)) {
    const { right } = statement.expression;

    // modules.exports = () => ({...})
    if (
      right?.kind === ts.SyntaxKind.ArrowFunction ||
      right?.kind === ts.SyntaxKind.FunctionExpression
    ) {
      ({ sourceVariableName, declarationText } = parseFunction(
        statement,
        sourceText,
      ));
    }
    // module.exports = {...}
    else {
      sourceVariableName = right?.escapedText;
    }
  }
  // default export {...}
  else if (isDefaultExport(statement)) {
    sourceVariableName = statement.expression.escapedText;
  }
  return { variableName: sourceVariableName, text: declarationText };
}

// merges the config files
function mergeOutput({
  topText,
  declarationText,
  sourcePath,
  templatePath,
}: {
  topText: string;
  declarationText: string;
  sourcePath: string;
  templatePath: string;
}): void {
  const baseFile = fs.readFileSync(templatePath, 'utf8');
  const newText = baseFile
    .replace('// INSERT TOP TEXT', topText)
    .replace('// INSERT CONFIG TEXT', declarationText);
  fs.writeFileSync(sourcePath, newText);
}

// parses the function statement for source variable name and declaration text
function parseFunction(
  funcStatement: ts.Statement,
  sourceText: string,
): {
  sourceVariableName: string | undefined;
  declarationText: string | undefined;
} {
  const { right } = funcStatement.expression;

  let sourceVariableName, declarationText;

  const functionStatement = right?.body.statements;
  if (functionStatement) {
    sourceVariableName =
      functionStatement[functionStatement.length - 1].expression.escapedText;

    if (functionStatement[0].declarationList) {
      declarationText = getDeclaration(
        functionStatement[0].declarationList,
        sourceText,
      );
    }
  }
  return { sourceVariableName, declarationText };
}

// gets the declaration text from non-function statements
function getDeclaration(
  declarationList: ts.VariableDeclarationList,
  sourceText: string,
): string {
  const declaration = declarationList.declarations[0];
  const { initializer } = declaration;
  const text = sourceText.substring(initializer.pos, initializer.end).trim();
  if (text[0] === '{' && text[text.length - 1] === '}') {
    return text.substring(1, text.length - 1);
  }
}

// merges the config files
export function mergeConfigFile(
  sourcePath: string,
  templatePath: string,
): boolean {
  const node = ts.createSourceFile(
    'sourceText.ts', // fileName
    fs.readFileSync(sourcePath, 'utf8'), // sourceText
    ts.ScriptTarget.Latest, // langugeVersion
  );

  const sourceText = node.text;

  let topText = '',
    declarationText,
    sourceVariableName;

  for (const statement of node.statements) {
    const { variableName, text } = getSourceVariableName(statement, sourceText);
    if (text) {
      declarationText = text;
    }
    if (variableName) {
      sourceVariableName = variableName;
    }

    if (statement.declarationList) {
      declarationText = getDeclaration(statement.declarationList, sourceText);
    }

    if (statement.kind === ts.SyntaxKind.ImportDeclaration) {
      let defaultImport = '',
        namedImports = '',
        separator = '';

      if (statement.importClause.name) {
        defaultImport = statement.importClause.name.escapedText;
      }
      if (statement.importClause.namedBindings) {
        namedImports = `{${statement.importClause.namedBindings.elements
          .map((el: ts.ImportSpecifier) => el.name.escapedText)
          .join(', ')}}`;
      }
      if (defaultImport && namedImports) {
        separator = ', ';
      }
      topText = topText.concat(
        `import ${defaultImport}${separator}${namedImports} from "${statement.moduleSpecifier.text}";\n`,
      );
    }
  }
  if (declarationText) {
    mergeOutput({ topText, declarationText, sourcePath, templatePath });
    return true;
  }
  return false;
}
