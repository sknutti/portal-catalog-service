import { script_v1 } from 'googleapis';
import Script = script_v1.Script;

let scriptSource: string | undefined;

export class SpreadsheetAppScriptsManager {
    /**
     * Generates a Google Apps Script project for the spreadsheet, and populates the project with the correct file data.
     *
     * @returns the generated project's scriptId.
     */
    static async generateScriptProjectForSheet(spreadsheetId: string, spreadsheetName: string, script: Script): Promise<string> {
        const appScriptSource = SpreadsheetAppScriptsManager.loadScriptSource();

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
                    projectContentResponse.data.files![0], // The manifest file
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

    /**
     * Updates the script project with the latest app script source.
     */
    static async updateExistingScriptProject(scriptId: string, script: Script): Promise<void> {
        const appScriptSource = SpreadsheetAppScriptsManager.loadScriptSource();

        const projectContentResponse = await script.projects.getContent({scriptId});

        await script.projects.updateContent({
            scriptId,
            requestBody: {
                files: [
                    projectContentResponse.data.files![0], // The manifest file
                    {
                        type: 'SERVER_JS',
                        source: appScriptSource,
                        name: 'Code'
                    }
                ]
            }
        });
    }

    private static loadScriptSource(): string {
        if (!scriptSource) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            scriptSource = require('../app-script.ts').default as string; // A  webpack loader causes this to be imported as a transpiled string.
        }

        return scriptSource;
    }
}
