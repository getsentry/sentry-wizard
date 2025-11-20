import * as fs from 'fs';
import * as path from 'path';

export function gemFile(projectPath: string): string | null {
  const gemfilePath = path.join(projectPath, 'Gemfile');
  return fs.existsSync(gemfilePath) ? gemfilePath : null;
}

export function addSentryPluginToGemfile(projectDir: string): boolean {
  const gemfilePath = gemFile(projectDir);
  if (!gemfilePath) {
    return false;
  }

  const fileContent = fs.readFileSync(gemfilePath, 'utf8');

  // Check if the sentry plugin is already in the Gemfile
  const sentryPluginRegex = /gem\s+['"]fastlane-plugin-sentry['"]/;
  if (sentryPluginRegex.test(fileContent)) {
    // Sentry plugin already exists, no need to add it
    return true;
  }

  // Find the best place to insert the gem
  // Look for other fastlane plugins first, then fastlane gem, then add at the end
  const fastlanePluginRegex = /gem\s+['"](fastlane-plugin-[^'"]+)['"]/;
  const fastlaneGemRegex = /gem\s+['"]fastlane['"]/;

  let insertionPoint: number;
  let insertionContent: string;

  const fastlanePluginMatch = fastlanePluginRegex.exec(fileContent);
  const fastlaneGemMatch = fastlaneGemRegex.exec(fileContent);

  if (fastlanePluginMatch) {
    // Insert after the last fastlane plugin
    const lines = fileContent.split('\n');
    let lastPluginLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (fastlanePluginRegex.test(lines[i])) {
        lastPluginLine = i;
      }
    }
    const beforeInsert = lines.slice(0, lastPluginLine + 1);
    const afterInsert = lines.slice(lastPluginLine + 1);
    insertionContent = [
      ...beforeInsert,
      "gem 'fastlane-plugin-sentry'",
      ...afterInsert,
    ].join('\n');
  } else if (fastlaneGemMatch) {
    // Insert after the fastlane gem
    const endOfMatch = fastlaneGemMatch.index + fastlaneGemMatch[0].length;
    const nextLineIndex = fileContent.indexOf('\n', endOfMatch);
    if (nextLineIndex !== -1) {
      insertionPoint = nextLineIndex + 1;
      insertionContent =
        fileContent.slice(0, insertionPoint) +
        "gem 'fastlane-plugin-sentry'\n" +
        fileContent.slice(insertionPoint);
    } else {
      // Add at the end of the file
      insertionContent = fileContent + "\ngem 'fastlane-plugin-sentry'\n";
    }
  } else {
    // Add at the end of the file
    insertionContent = fileContent + "\ngem 'fastlane-plugin-sentry'\n";
  }

  fs.writeFileSync(gemfilePath, insertionContent, 'utf8');
  return true;
}
