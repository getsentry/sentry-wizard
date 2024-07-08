import * as fs from 'fs';

const GITIGNORE_FILENAME = '.gitignore';

export async function addToGitignore(filepath: string): Promise<boolean> {
  /**
   * Don't check whether the given file is ignored because:
   * 1. It's tricky to check it without git.
   * 2. Git might not be installed or accessible.
   * 3. It's convenient to use a module to interact with git, but it would
   *    increase the size x2 approximately. Docs say to run the Wizard without
   *    installing it, and duplicating the size would slow the set-up down.
   * 4. The Wizard is meant to be run once.
   * 5. A message is logged informing users it's been added to the gitignore.
   * 6. It will be added to the gitignore as many times as it runs - not a big
   *    deal.
   * 7. It's straightforward to remove it from the gitignore.
   */
  try {
    await fs.promises.appendFile(GITIGNORE_FILENAME, `\n${filepath}\n`);
    return true;
  } catch {
    return false;
  }
}
