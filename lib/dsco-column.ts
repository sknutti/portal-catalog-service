import { XrayActionSeverity } from '@dsco/ts-models';

export class DscoColumn {
    static readonly DEFAULT_COLUMN_WIDTH = 100;

    // Both of these can be true
    public isExtended = false;
    public isCore = false;

    constructor(
      public name: string,
      public validation: DscoColValidation = {
          required: 'none'
      }
    ) {
    }

    private guessPixelSize(): number {
        let total = 0;
        for (const char of this.name) {
            if (char === char.toUpperCase()) {
                total += 10;
            } else {
                total += 8;
            }
        }
        return total;
    }

    public colWidth(): number {
        return this.guessPixelSize() > DscoColumn.DEFAULT_COLUMN_WIDTH ? 160 : DscoColumn.DEFAULT_COLUMN_WIDTH;
    }
}

export interface DscoColValidation {
    format?: 'string' | 'integer' | 'date-time' | 'date' | 'time' | 'number' | 'boolean' | 'array' | 'enum' | 'uri' | 'email';
    enumVals?: Set<string | number>;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    match?: string; // regex
    dontMatch?: string[]; // regex
    regexMessage?: string;
    required: XrayActionSeverity | 'none';
    arrayType?: 'string' | 'integer' | 'number';
    dateInFuture?: boolean;
}
