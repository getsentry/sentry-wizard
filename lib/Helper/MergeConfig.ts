import * as fs from 'fs';

// merges the config files
export function mergeConfigFile(
  sourcePath: string,
  templatePath: string,
): boolean {
  try {
    const templateFile = fs.readFileSync(templatePath, 'utf8');
    const sourceFile = fs.readFileSync(sourcePath, 'utf8');
    const newText = templateFile.replace('// ORIGINAL CONFIG', sourceFile);
    Function(newText); // check if the file is valid javascript
    fs.writeFileSync(sourcePath, newText);
    return true;
  } catch (error) {
    return false;
  }
}
