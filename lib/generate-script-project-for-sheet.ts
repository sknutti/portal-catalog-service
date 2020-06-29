import { script_v1 } from 'googleapis';
import Script = script_v1.Script;
import Schema$Project = script_v1.Schema$Project;

/**
 * Generates a Google Apps Script project for the spreadsheet, and populates the project with the correct file data.
 *
 * @returns the generated project's scriptId.
 */
export async function generateScriptProjectForSheet(spreadsheetId: string, spreadsheetName: string, script: Script): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const appScriptSource: string = require('../app-script.ts').default; // A  webpack loader causes this to be imported as a transpiled string.

    const createdProjectResp = await script.projects.create({
        requestBody: {
            title: `${spreadsheetName}||Scripts`,
            parentId: spreadsheetId,
        }
    });

    const projectContentResponse = await script.projects.getContent({
        scriptId: createdProjectResp.data.scriptId!,
    });

    await script.projects.updateContent({
        scriptId: createdProjectResp.data.scriptId!,
        requestBody: {
            files: [
                projectContentResponse.data.files![0],
                {
                    type: 'SERVER_JS',
                    source: appScriptSource,
                    name: 'Code'
                }
            ]
        }
    });

    return createdProjectResp.data.scriptId!;
}
