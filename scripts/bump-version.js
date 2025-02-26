const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
console.log(`Updating \`version.ts\` to ${newVersion}`);

const getVersionFileContent = (version) => `// DO NOT modify this file manually!
// This is file is updated at release time.

export const WIZARD_VERSION = '${version}';
`;

const versionFilePath = path.join(__dirname, '..', 'src', 'version.ts');

try {
  fs.writeFileSync(versionFilePath, getVersionFileContent(newVersion));
} catch (e) {
  console.error('Failed to update `version.ts` file', e);
  process.exit(1);
}
