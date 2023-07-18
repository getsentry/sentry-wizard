import * as child_process from 'child_process';
import * as https from 'https';
import * as fs from 'fs';

export function hasSentryCLI(): boolean {
    try {
        child_process.execSync('sentry-cli --version');
        return true;
    } catch (e) {
        return false;
    }
}

export async function installSentryCLI(): Promise<void> {
    const httpAsync = new Promise((resolve, reject) => {
        const file = fs.createWriteStream('installcli.sh');
        https.get('https://sentry.io/get-cli/', (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                try {
                    child_process.execSync('bash ./installcli.sh');
                } catch (e) {
                    reject(e);
                    return
                }
                fs.unlinkSync('installcli.sh');
                resolve(null);
            });

            file.on('error', (err) => {
                fs.unlinkSync('installcli.sh');
                reject(err);
            });
        });
    });

    await httpAsync;
}

export function executeSync(command: string): string {
    const output = child_process.execSync(command);
    return output.toString();
}

export function execute(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        child_process.exec(command, (error, stdout, _) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(stdout);
        });
    });
}
