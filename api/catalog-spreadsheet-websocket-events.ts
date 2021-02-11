export interface CatalogSpreadsheetWebsocketEvents {
    progressUpdate: {
        message: string;
        progress: number;
        categoryPath: string;
    };
    success: {
        totalRowCount: number;
        rowWithError?: number;
        validationMessages?: string[];
        categoryPath: string;
    };
    error: {
        message: string;
        error: unknown;
        categoryPath: string;
    };
}
