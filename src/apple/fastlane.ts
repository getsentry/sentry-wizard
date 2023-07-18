import * as fs from 'fs';
import * as path from 'path';
import * as templates from './templates';
import { askForItemSelection } from '../utils/clack-utils';


export function fastFile(projectPath: string): string | null {
    const fastlanePath = path.join(projectPath, 'fastlane', 'Fastfile');
    return fs.existsSync(fastlanePath) ? fastlanePath : null;
}

function findIOSPlatform(content: string): { index: number, length: number } | null {
    const platformRegex = /^ *platform\s+:([^ ]+)[^\n]*\n/gim
    let match = platformRegex.exec(content);
    if (!match) {
        // No platform found, treat whole file as one platform.
        return { index: 0, length: content.length };
    }

    let index = -1;
    while (match) {
        if (match[1] === "ios") {
            index = match.index + match[0].length;
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
    const laneRegex = /^ {2}lane\s+:([^ ]+)[^\n]*\n/gim
    let match = laneRegex.exec(content);
    if (!match) {
        return null;
    }

    const lanes: { index: number, length: number, name: string }[] = [];
    while (match) {
        const laneEnd = /^ {2}end/m.exec(content.slice(match.index + match[0].length));
        if (laneEnd === null) {
            return null;
        }
        lanes.push({ index: match.index + match[0].length, length: laneEnd.index, name: match[1] });
        match = laneRegex.exec(content);
    }
    return lanes;
}

function addSentryToLane(content: string, lane: { index: number, length: number, name: string }, org: string, project: string, token: string): string {
    const laneContent = content.slice(lane.index, lane.index + lane.length);
    const sentryCLIMatch = /sentry_cli\s*\([^)]+\)/gim.exec(laneContent);
    if (sentryCLIMatch) {
        // Sentry already added to lane. Update it.
        return content.slice(0, sentryCLIMatch.index + lane.index) +
            templates.getFastlaneSnippet(org, project, token).trim() +
            content.slice(sentryCLIMatch.index + sentryCLIMatch[0].length + lane.index);
    }

    // Sentry not added to lane. Add it.
    return content.slice(0, lane.index + lane.length) + "\n" +
        templates.getFastlaneSnippet(org, project, token) + "\n" +
        content.slice(lane.index + lane.length);
}

export async function addSentryToFastlane(projectPath: string, org: string, project: string, token: string): Promise<boolean> {
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
    const lanes = findLanes(platformContent)
    lanes?.forEach(l => l.index += platform.index);

    if (!lanes || lanes.length === 0) {
        return false;
    }

    let newFileContent: string | undefined;
    if (lanes.length === 1) {
        newFileContent = addSentryToLane(fileContent, lanes[0], org, project, token);
    } else {
        const laneNames = lanes.map(l => l.name);
        const selectedLane = await askForItemSelection(laneNames, "Select lane to add Sentry to:");
        if (selectedLane === undefined) {
            return false;
        }
        newFileContent = addSentryToLane(fileContent, lanes[selectedLane.index], org, project, token);
    }

    fs.writeFileSync(fastFilePath, newFileContent, 'utf8');
    return true;
}