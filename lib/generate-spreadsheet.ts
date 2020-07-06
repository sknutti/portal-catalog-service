import { axiosRequest } from '@dsco/aws-auth';
import {
    DscoEnv,
    PipelineRule,
    PipelineRulePrimaryDataType,
    PipelineRuleSecondaryDataType,
    UnexpectedError,
    XrayActionSeverity
} from '@dsco/ts-models';
import * as AWS from 'aws-sdk';
import { Credentials } from 'aws-sdk';
import { DscoColumn, DscoColValidation } from './dsco-column';
import { DscoSpreadsheet } from './dsco-spreadsheet';
import { GetPipelineCatalogRulesRequest } from './get-pipeline-catalog-rules.request';
import { GetPipelineRulesRequest } from './get-pipeline-rules.request';

const env = process.env.ENVIRONMENT! as DscoEnv;

/**
 * Generates a spreadsheet with column data pulled from the simple rules.
 */
export async function generateSpreadsheet(supplierId: number, retailerId: number, categoryPath: string): Promise<DscoSpreadsheet | UnexpectedError> {
    const colsOrErr = await generateSpreadsheetCols(supplierId, retailerId, categoryPath);
    if (!Array.isArray(colsOrErr)) {
        return colsOrErr;
    }

    const spreadsheet = new DscoSpreadsheet(`${env}||${supplierId}||${retailerId}||${categoryPath}`, retailerId);

    for (const colName in colsOrErr) {
        spreadsheet.addColumn(colsOrErr[colName]);
    }

    return spreadsheet;
}

/**
 * Generates column data using dsco's simple rules.
 */
export async function generateSpreadsheetCols(supplierId: number, retailerId: number, categoryPath: string): Promise<DscoColumn[] | UnexpectedError> {
    const [catalogRulesResp, allRulesResp] = await Promise.all([
        axiosRequest(
          new GetPipelineCatalogRulesRequest(env, [categoryPath], retailerId.toString(10)),
          env,
          AWS.config.credentials as Credentials,
          process.env.AWS_REGION!
        ),
        axiosRequest(
          new GetPipelineRulesRequest(env),
          env,
          AWS.config.credentials as Credentials,
          process.env.AWS_REGION!
        )
    ] as const);

    if (!catalogRulesResp.data.success) {
        return catalogRulesResp.data;
    } else if (!allRulesResp.data.success) {
        return allRulesResp.data;
    }

    const allCols: DscoColumn[] = [];
    const cols = {
        core: {} as Record<string, DscoColumn>,
        extended: {} as Record<string, DscoColumn>
    };
    const ensureCol = (name: string, rule: PipelineRule): DscoColumn => {
        const type = rule.attrType === 'custom' ? 'extended' : 'core';

        let result = cols[type][name];
        if (!result) {
            result = cols[type][name] = new DscoColumn(name, type, {
                // Custom attributes should default to info, not none
                required: type === 'extended' ? XrayActionSeverity.info : 'none'
            });
            allCols.push(result);
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

    return allCols;
}

/**
 * These are columns that we don't want to show up in the final spreadsheet
 */
const SKIPPED_COLS = new Set(['item_id', 'supplier_id', '__supplier_name', 'trading_partner_id',
    'trading_partner_name', '__create_date', 'last_update_date', 'dsco_last_product_status_update_date',
    'dsco_last_cost_update_date', 'attributes[]/name', 'attributes[]/value', 'product_images[]/name', 'product_images[]/reference',
    'images[]/name', 'images[]/reference', 'extended_attributes']);

/**
 * Parses the pipeline rule, creating a column for it if necessary
 */
function parsePipelineRule(rule: PipelineRule, ensureCol: (name: string, rule: PipelineRule) => DscoColumn): void {
    if (typeof rule.field === 'string' && SKIPPED_COLS.has(rule.field)) {
        return;
    }

    function setValidation<K extends keyof DscoColValidation>(field: string, key: K, value: DscoColValidation[K]): void {
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
            if (SKIPPED_COLS.has(field)) {
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
            default: return;
        }
    } else if (rule.type === 'range' && rule.severity !== XrayActionSeverity.info) {
        const col = ensureCol(rule.field, rule);
        col.validation.min = rule.min;
        col.validation.max = rule.max;
    } else if ((rule.type === 'length_range' || rule.type === 'catalog_length_range') && rule.severity !== XrayActionSeverity.info) {
        const col = ensureCol(rule.field, rule);
        col.validation.minLength = rule.minLength;
        col.validation.maxLength = rule.maxLength;
    } else if ((rule.type === 'pattern_match' || rule.type === 'catalog_pattern_match') && rule.severity !== XrayActionSeverity.info) {
        const col = ensureCol(rule.field, rule);
        col.validation.match = rule.pattern;
        col.validation.regexMessage = rule.description || rule.message;
    }  else if ((rule.type === 'multi_pattern' || rule.type === 'catalog_multi_pattern') && rule.severity !== XrayActionSeverity.info) {
        const col = ensureCol(rule.field, rule);
        col.validation.match = rule.pattern;
        col.validation.dontMatch = rule.notPatterns;
        col.validation.regexMessage = rule.description || rule.message;
    } else if (rule.type === 'date_in_future' && rule.severity !== XrayActionSeverity.info) {
        setValidation(rule.field, 'dateInFuture', true);
    }
}