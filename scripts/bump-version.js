const fs = require('fs');
const path = require('path');

const getVersionFileContent = (version) => `// DO NOT modify this file manually!
// This is file is updated at release time.

export const WIZARD_VERSION = '${version}';
`;

const newVersion = process.argv[2];

if (typeof newVersion !== 'string' || !newVersion.match(/^\d+\.\d+\.\d+.*$/)) {
  console.error(
    `Invalid version provided (${newVersion}). Please provide a valid semver version.`,
  );
  process.exit(1);
}

console.log(`Updating \`version.ts\` to ${newVersion}`);

const versionFilePath = path.join(__dirname, '..', 'src', 'version.ts');

try {
  fs.writeFileSync(versionFilePath, getVersionFileContent(newVersion));
} catch (e) {
  console.error('Failed to update `version.ts` file', e);
  process.exit(1);
}
