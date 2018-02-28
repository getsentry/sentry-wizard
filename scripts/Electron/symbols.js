const download = require('electron-download');
const SentryCli = require('@sentry/cli');
const sentryCli = new SentryCli('./sentry.properties');

const SYMBOL_CACHE_FOLDER = '.electron-symbols';

const package = require('./package.json');

async function main() {
  let electronVersion = getElectronVersion().replace(/[^\d\.]+/g, '');
  if (!electronVersion) {
    console.error('Cannot detect electron version, check package.json');
    return;
  }
  console.log('We are starting to download all possible electron symbols');
  console.log('We need it in order to symbolicate native crashes');
  console.log('This step is only needed once whenever you update your electron version');
  console.log('Just call this script again it should do everything for you.');

  let zipPath = await downloadSymbols(electronVersion, 'darwin');
  await sentryCli.execute(['upload-dif', '-t', 'dsym', zipPath], true);
  zipPath = await downloadSymbols(electronVersion, 'win32', 'ia32');
  await sentryCli.execute(['upload-dif', '-t', 'breakpad', zipPath], true);
  zipPath = await downloadSymbols(electronVersion, 'win32', 'x64');
  await sentryCli.execute(['upload-dif', '-t', 'breakpad', zipPath], true);
  zipPath = await downloadSymbols(electronVersion, 'linux', 'x64');
  await sentryCli.execute(['upload-dif', '-t', 'breakpad', zipPath], true);

  console.log('Finished downloading and uploading to Sentry');
  console.log(`Feel free to delete the ${SYMBOL_CACHE_FOLDER}`);
}

function getElectronVersion() {
  let electronVersion = package && package.dependencies.electron;
  if (electronVersion) {
    return electronVersion;
  }
  electronVersion = package && package.devDependencies.electron;
  if (electronVersion) {
    return electronVersion;
  }
  return false;
}

async function downloadSymbols(version, platform, arch) {
  return new Promise((resolve, reject) => {
    download(
      {
        version,
        arch,
        platform,
        cache: SYMBOL_CACHE_FOLDER,
      },
      (err, zipPath) => {
        if (err) {
          reject(err);
        } else {
          resolve(zipPath);
        }
      }
    );
  });
}

main();
