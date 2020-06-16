import { drive_v3, sheets_v4 } from 'googleapis';
import Sheets = sheets_v4.Sheets;
import Drive = drive_v3.Drive;

export async function deleteAllSheets(sheets: Sheets, drive: Drive): Promise<void> {
    const sheetsToDelete = await listSheets(drive);

    for (const sheet of sheetsToDelete) {
        console.warn(`Deleting sheet: ${  sheet.name}`);
        await removeSheet(sheets, drive, sheet.id);
    }
    console.warn('Deleted all sheets!');
}

async function listSheets(drive: Drive): Promise<Array<{name: string, id: string}>> {
    const resp = await drive.files.list();

    return (resp.data.files || []).filter(file => {
        return file.mimeType === 'application/vnd.google-apps.spreadsheet';
    }).map(file => ({name: file.name!, id: file.id!}));
}

async function removeSheet(sheets: Sheets, drive: Drive, sheetId: string) {
    const resp = await drive.permissions.list({
        fileId: sheetId
    });
    const permissions = resp.data.permissions ?? [];

    // This deletes the permissions that share the sheets with everybody.  Causes the files to actually be deleted
    for (const permission of permissions) {
        if (permission.type === 'user' || !permission.id) {
            continue;
        }

        await drive.permissions.delete({
            fileId: sheetId,
            permissionId: permission.id
        });
    }

    await drive.files.delete({
        fileId: sheetId
    });
}
