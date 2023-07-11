import * as fs from 'fs';
import * as path from 'path';


export function fastFile(projectPath: string): string | null {
    const fastlanePath = path.join(projectPath, 'fastlane', 'Fastfile');
    return fs.existsSync(fastlanePath) ? fastlanePath : null;
}

function findIOSPlatform(content: string): { index: number, length: number } | null {
    const platformRegex = /^ *platform\s+:([^ ]+)[^\n]*/gim
    let match = platformRegex.exec(content);
    if (!match) {
        // No platform found, treat whole file as one platform.
        return { index: 0, length: content.length };
    }

    let index = -1;
    while (match) {
        if (match[1] === "ios") {
            index = match.index;
            break;
        }
        match = platformRegex.exec(content);
    }

    if (index === -1) {
        return null;
    }

    //After finding the platform, we need to find the end of the platform block.
    //This solution has the assumption that the file is well formed,
    //which is not a perfect solution, but it's good enough assumption.
    const platformEndRegex = /^end[^\n]*/gim
    match = platformEndRegex.exec(content.slice(index));
    if (!match) {
        return null;
    }

    return { index, length: match.index };
}

function findLanes(content: string): { index: number, length: number, name: string }[] | null {
    const laneRegex = /^ {2}lane\s+:([^ ]+)[^\n]*/gim
    let match = laneRegex.exec(content);
    if (!match) {
        return null;
    }

    const lanes: { index: number, length: number, name: string }[] = [];
    while (match) {
        const laneEnd = /^ {2}end/m.exec(content.slice(match.index));
        if (laneEnd === null) {
            return null;
        }
        lanes.push({ index: match.index + match[0].length, length: match.index - match[0].length + laneEnd.index, name: match[1] });
        match = laneRegex.exec(content);
    }
    return lanes;
}

export function addSentryToFastlane(projectPath: string): boolean {
    const fastFilePath = fastFile(projectPath);
    if (!fastFilePath) {
        return false;
    }

    const fileContent = fs.readFileSync(fastFilePath, 'utf8');
    const platform = findIOSPlatform(fileContent);
    if (!platform) {
        return false;
    }

    const platformContent = fileContent.slice(platform.index, platform.index + platform.length);
    const lanes = findLanes(platformContent);

    if (!lanes) {
        return false;
    }



    return true;
}