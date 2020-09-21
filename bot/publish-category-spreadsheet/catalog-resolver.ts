import { ResolveExceptionGearmanApi, ResolveExceptionGearmanApiResponse } from '@dsco/gearman-apis';
import { XrayActionSeverity } from '@dsco/ts-models';
import { DscoCatalogRow } from '@lib/spreadsheet';
import { sendWebsocketEvent } from '@lib/utils';
import { SpreadsheetRowMessage } from '../../api';

const THROTTLE_TIME = 300;
const gearmanActionSuccess: Set<string> = new Set([
    'SAVED',
    'CREATED',
    'UPDATED',
    'SUCCESS'
]);

export class CatalogResolver {
    /**
     * This will be filled with any errors found while resolving
     */
    rowMessages: Record<number, SpreadsheetRowMessage[]> = {};
    numSuccessfulRows = 0;
    numFailedRows = 0;
    numEmptyRows = 0;
    rowIdxsWithErrors: number[] = [];

    /**
     * The number of rows that were modified that have been processed.  Used to give a progress report.
     */
    private numProcessedRows = 0;

    /**
     * Keeps track of when we last sen't a progress report, used to throttle progress updates.
     */
    private lastSendTime = 0;

    /**
     * @param rows
     * @param numRowsToProcess the number of rows that were modified that need to be processed.  Used to give a progress report.
     * @param userId
     * @param supplierId
     * @param categoryPath
     * @param fromPct
     * @param toPct
     */
    constructor(
      private rows: IterableIterator<Promise<DscoCatalogRow>>,
      private numRowsToProcess: number,
      private userId: number,
      private supplierId: number,
      private categoryPath: string,
      private fromPct: number,
      private toPct: number
    ) {
    }

    resolveCatalogsWithProgress(): Promise<CatalogResolveRecord[]> {
        const promises: Array<Promise<CatalogResolveRecord>> = [];

        let rowIdx = 1; // start at 1 for the header row
        for (const rowPromise of this.rows) {
            promises.push(rowPromise.then(row => this.resolveCatalog(row, rowIdx)));
            rowIdx++;
        }

        return Promise.all(promises);
    }


    private async resolveCatalog(row: DscoCatalogRow, rowIdx: number): Promise<CatalogResolveRecord> {
        let response: ResolveExceptionGearmanApiResponse | undefined;
        let hasError = false;

        if (row.modified) {
            if (row.emptyRow) {
                this.numEmptyRows++;
            } else  { // Try to save all rows that aren't empty
                response = await this.resolveModifiedCatalog(row);
                hasError = this.hasError(response, rowIdx);
            }

            this.numProcessedRows++;
            const now = Date.now();

            // Send a progress report if the row has been modified
            if (now - this.lastSendTime > THROTTLE_TIME) {
                this.lastSendTime = now;
                await sendWebsocketEvent('publishCatalogSpreadsheetProgress', {
                    categoryPath: this.categoryPath,
                    progress: this.fromPct + ((this.toPct - this.fromPct) * (this.numProcessedRows / this.numRowsToProcess)),
                    message: `Validating & saving rows ${this.numProcessedRows}/${this.numRowsToProcess}...`
                }, this.supplierId);
            }
        }

        return {response, rowIdx, hasError, row};
    }

    private async resolveModifiedCatalog(row: DscoCatalogRow): Promise<ResolveExceptionGearmanApiResponse> {
        return new ResolveExceptionGearmanApi('CreateOrUpdateCatalogItem', {
            caller: {
                account_id: this.supplierId.toString(10),
                user_id: this.userId.toString(10)
            },
            params: row.catalog
        }).submit();
    }

    private addRowMessage(row: number, message: SpreadsheetRowMessage) {
        let messages = this.rowMessages[row];
        if (!messages) {
            messages = this.rowMessages[row] = [];
        }
        messages.push(message);
    }

    /**
     * Handles any errors in the gearman response, returning true if there was an error
     */
    private hasError(response: ResolveExceptionGearmanApiResponse, rowIdx: number): boolean {
        const hasError = !gearmanActionSuccess.has(response.action);

        let hasErrorMessage = false;

        for (const msg of response.validation_messages || []) {
            // TODO: We want all validation messages here, but are only flowing errors because of AWS message size limit
            // @see https://dsco.atlassian.net/browse/ES-857
            if (msg.messageType === XrayActionSeverity.error) {
                this.addRowMessage(rowIdx + 1, msg);
                hasErrorMessage = true;
            }
        }

        if (hasError && !hasErrorMessage) {
            const messages = response.messages?.length ? response.messages : ['Unable to save item.'];

            for (const message of messages) {
                this.addRowMessage(rowIdx + 1, {message, messageType: XrayActionSeverity.error});
            }
        }

        if (hasError) {
            this.numFailedRows++;
            this.rowIdxsWithErrors.push(rowIdx);
        } else {
            this.numSuccessfulRows++;
        }

        return hasError;
    }
}


interface CatalogResolveRecord {
    row: DscoCatalogRow;
    rowIdx: number;
    hasError: boolean;
    response?: ResolveExceptionGearmanApiResponse;
}
