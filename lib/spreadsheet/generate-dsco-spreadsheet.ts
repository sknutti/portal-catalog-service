import { axiosRequest } from '@dsco/aws-auth';
import {
    DscoEnv,
    PipelineErrorType,
    PipelineRule,
    PipelineRulePrimaryDataType,
    PipelineRuleSecondaryDataType,
    UnexpectedError,
} from '@dsco/ts-models';
import { descriptions } from '@lib/descriptions';
import { getAwsRegion } from '@lib/environment';
import { GetPipelineCatalogRulesRequest, GetPipelineRulesRequest } from '@lib/requests';
import { getDscoEnv } from '@lib/environment';
import * as AWS from 'aws-sdk';
import { Credentials } from 'aws-sdk';
import { DscoColumn, DscoColValidation } from './dsco-column';
import { DscoSpreadsheet } from './dsco-spreadsheet';

/**
 * Generates a spreadsheet with column data pulled from the simple rules.
 */
export async function generateDscoSpreadsheet(
    supplierId: number,
    retailerId: number,
    categoryPath: string,
): Promise<DscoSpreadsheet | UnexpectedError> {
    const colsOrErr = await generateSpreadsheetCols(supplierId, retailerId, categoryPath);
    if (!Array.isArray(colsOrErr)) {
        return colsOrErr;
    }

    const spreadsheet = new DscoSpreadsheet(`${getDscoEnv()}||${supplierId}||${retailerId}||${categoryPath}`);

    // If the first column isn't sku, sort to enforce it.
    if (colsOrErr[0].fieldName !== 'sku') {
        colsOrErr.sort((a, b) => {
            if (a.fieldName === 'sku') {
                return -1;
            } else if (b.fieldName === 'sku') {
                return 1;
            } else {
                return 0;
            }
        });
    }
    for (const colName in colsOrErr) {
        spreadsheet.addColumn(colsOrErr[colName]);
    }

    return spreadsheet;
}

/**
 * Generates column data using dsco's simple rules.
 */
async function generateSpreadsheetCols(
    supplierId: number,
    retailerId: number,
    categoryPath: string,
): Promise<DscoColumn[] | UnexpectedError> {
    const env = getDscoEnv();

    const [catalogRulesResp, allRulesResp] = await Promise.all([
        axiosRequest(
            new GetPipelineCatalogRulesRequest(env, [categoryPath], retailerId.toString(10)),
            env,
            AWS.config.credentials as Credentials,
            getAwsRegion(),
        ),
        axiosRequest(
            new GetPipelineRulesRequest(env, retailerId),
            env,
            AWS.config.credentials as Credentials,
            getAwsRegion(),
        ),
    ] as const);

    if (!catalogRulesResp.data.success) {
        return catalogRulesResp.data;
    } else if (!allRulesResp.data.success) {
        return allRulesResp.data;
    }

    const allCols: DscoColumn[] = [];
    const cols = {
        core: {} as Record<string, DscoColumn>,
        extended: {} as Record<string, DscoColumn>,
    };

    const ensureCol = (name: string, rule: PipelineRule): DscoColumn => {
        const type = rule.attrType === 'custom' ? 'extended' : 'core';

        let result = cols[type][name];
        if (!result) {
            const description = (rule as any).attributeDescription || descriptions[name];
            result = cols[type][name] = new DscoColumn(name, description, type, {
                // Custom attributes should default to info, not none
                required: type === 'extended' ? PipelineErrorType.info : 'none',
            });
            allCols.push(result);
        }

        // If there is both a core and extended attribute of the same name, prefix the core with "Dsco: "
        if (cols.core[name] && cols.extended[name]) {
            cols.core[name].shouldHaveDscoPrefix = true;
        }

        return result;
    };

    for (const dscoRule of allRulesResp.data.dsco || []) {
        if (dscoRule.objectType === 'catalog') {
            parsePipelineRule(dscoRule, ensureCol);
        }
    }

    for (const rule of catalogRulesResp.data.rules) {
        parsePipelineRule(rule, ensureCol);
    }

    // const output = {
    //     required: [] as any[],
    //     recommended: [] as any[],
    //     optional: [] as any[],
    // };
    //
    // for (const col of allCols) {
    //     const obj = {
    //         column_name: col.name,
    //         description: col.fieldDescription,
    //         validations: {...col.validation},
    //         owner: col.type === 'core' ? 'Dsco' : 'Nordstrom',
    //
    //     };
    //     if (obj.validations?.required) {
    //         (obj.validations.required as any) = undefined;
    //     }
    //     if (obj.validations?.enumVals) {
    //         (obj.validations as any).enumVals = Array.from(obj.validations.enumVals);
    //     }
    //     if (obj.validations && !Object.keys(obj.validations).length) {
    //         (obj as any).validations = undefined;
    //     }
    //
    //     if (col.validation?.required === PipelineErrorType.error) {
    //         output.required.push(obj);
    //     } else if (col.validation?.required === PipelineErrorType.warn) {
    //         output.recommended.push(obj);
    //     } else {
    //         output.optional.push(obj);
    //     }
    // }
    //
    // [output.required, output.recommended, output.optional].forEach(arr => arr.sort((a, b) => a.owner > b.owner ? -1 : 1));
    //
    // require('fs').writeFileSync("/Users/aidan/temp/test.json", JSON.stringify(output));

    return allCols;
}

/**
 * Parses the pipeline rule, creating a column for it if necessary
 */
function parsePipelineRule(rule: PipelineRule, ensureCol: (name: string, rule: PipelineRule) => DscoColumn): void {
    if ((rule.type === 'catalog_image' || rule.type === 'image') && !rule.field.endsWith(rule.imageName)) {
        rule.field = `${rule.field}.${rule.imageName}`;
    }

    if (typeof rule.field === 'string' && shouldSkipCol(rule.field)) {
        return;
    }

    function setValidation<K extends keyof DscoColValidation>(
        field: string,
        key: K,
        value: DscoColValidation[K],
    ): void {
        const col = ensureCol(field, rule);
        // Don't widen enums to strings
        if (key === 'format' && col.validation.format === 'enum' && value === 'string') {
            return;
        }
        // Default min to 0;
        if (col.validation.min === undefined && key === 'format' && (value === 'number' || value === 'integer')) {
            col.validation.min = 0;
        }
        col.validation[key] = value;
    }

    if (rule.type === 'required' || rule.type === 'catalog_required') {
        for (const field of rule.field) {
            if (shouldSkipCol(field)) {
                return;
            }

            setValidation(field, 'required', rule.severity);
        }
    } else if (rule.type === 'enum_match' || rule.type === 'catalog_enum_match') {
        const col = ensureCol(rule.field, rule);
        col.validation.format = 'enum';
        col.validation.enumVals = new Set(rule.values);
    } else if (rule.type === 'format' || rule.type === 'catalog_format') {
        const [primary, secondary] = rule.dataType;

        switch (primary) {
            case PipelineRulePrimaryDataType.INTEGER:
            case PipelineRulePrimaryDataType.NUMBER:
            case PipelineRulePrimaryDataType.BOOLEAN:
                setValidation(rule.field, 'format', primary);
                break;
            case PipelineRulePrimaryDataType.STRING: {
                switch (secondary) {
                    case PipelineRuleSecondaryDataType.DATE:
                    case PipelineRuleSecondaryDataType.DATE_TIME:
                    case PipelineRuleSecondaryDataType.TIME:
                    case PipelineRuleSecondaryDataType.URI:
                    case PipelineRuleSecondaryDataType.EMAIL:
                        setValidation(rule.field, 'format', secondary);
                        break;
                    default: {
                        setValidation(rule.field, 'format', 'string');
                        break;
                    }
                }
                break;
            }
            case PipelineRulePrimaryDataType.ARRAY: {
                const col = ensureCol(rule.field, rule);
                col.validation.format = 'array';
                col.validation.arrayType = rule.arrayDataType;
                break;
            }
            default:
                return;
        }
    } else if (rule.type === 'range' && rule.severity !== PipelineErrorType.info) {
        const col = ensureCol(rule.field, rule);
        col.validation.min = rule.min;
        col.validation.max = rule.max;
    } else if (
        (rule.type === 'length_range' || rule.type === 'catalog_length_range') &&
        rule.severity !== PipelineErrorType.info
    ) {
        const col = ensureCol(rule.field, rule);
        col.validation.minLength = rule.minLength;
        col.validation.maxLength = rule.maxLength;
    } else if (
        (rule.type === 'pattern_match' || rule.type === 'catalog_pattern_match') &&
        rule.severity !== PipelineErrorType.info
    ) {
        const col = ensureCol(rule.field, rule);
        col.validation.match = rule.pattern;
        col.validation.regexMessage = rule.description || rule.message;
    } else if (
        (rule.type === 'multi_pattern' || rule.type === 'catalog_multi_pattern') &&
        rule.severity !== PipelineErrorType.info
    ) {
        const col = ensureCol(rule.field, rule);
        col.validation.match = rule.pattern;
        col.validation.dontMatch = rule.notPatterns;
        col.validation.regexMessage = rule.description || rule.message;
    } else if (rule.type === 'date_in_future' && rule.severity !== PipelineErrorType.info) {
        setValidation(rule.field, 'dateInFuture', true);
    } else if (rule.type === 'image' || rule.type === 'catalog_image') {
        const col = ensureCol(rule.field, rule);
        col.validation.required = rule.severity;
        col.validation.format = 'image';
        col.validation.minWidth = rule.minWidth;
        col.validation.minHeight = rule.minHeight;
    }
}

/**
 * These are columns that we don't want to show up in the final spreadsheet
 */
const SKIPPED_COLS = new Set([
    'item_id',
    'supplier_id',
    'trading_partner_id',
    'dsco_trading_partner_id',
    'trading_partner_name',
    'dsco_trading_partner_name',
    'last_update_date',
    'dsco_last_product_status_update_date',
    'dsco_last_cost_update_date',
    'extended_attributes',
    'commission_amount',
]);

function shouldSkipCol(name: string): boolean {
    //Should allow images.name fields
    if (/^[a-zA-Z0-9_]*[iI]mages\.[a-zA-Z0-9_]+$/.test(name)) {
        return false;
    }

    // Skip fields starting in two underscores: __create_date
    // Skip fields with array or object access: attributes[]/name | attributes.name
    return SKIPPED_COLS.has(name) || name.startsWith('__') || /\[]|\.|\//.test(name);
}
