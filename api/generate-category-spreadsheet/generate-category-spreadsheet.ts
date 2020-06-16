import { axiosRequest } from '@dsco/aws-auth';
import { apiWrapper, getUser } from '@dsco/service-utils';
import {
    MissingRequiredFieldError,
    PipelineRule,
    PipelineRulePrimaryDataType,
    PipelineRuleSecondaryDataType,
    UnauthorizedError,
    XrayActionSeverity
} from '@dsco/ts-models';
import * as AWS from 'aws-sdk';
import { Credentials } from 'aws-sdk';
import { DscoColumn, DscoColValidation, DscoSpreadsheet } from '../../lib/dsco-spreadsheet';
import { GetPipelineCatalogRulesRequest } from '../../lib/get-pipeline-catalog-rules.request';
import { GetPipelineRulesRequest } from '../../lib/get-pipeline-rules.request';
import { prepareGoogleApis } from '../../lib/google-api-utils';
import { GenerateCategorySpreadsheetRequest } from './generate-category-spreadsheet.request';

export const generateCategorySpreadsheet = apiWrapper<GenerateCategorySpreadsheetRequest>(async (event) => {
    if (!event.body.retailerId) {
        return new MissingRequiredFieldError('retailerId');
    }
    if (!event.body.attrPath) {
        return new MissingRequiredFieldError('attrPath');
    }

    const user = await getUser(event.requestContext, process.env.AUTH_USER_TABLE!);

    // Must be logged in
    if (!user?.accountId) {
        return new UnauthorizedError();
    }

    const [catalogRulesResp, allRulesResp] = await Promise.all([
        axiosRequest(
          new GetPipelineCatalogRulesRequest('test', [event.body.attrPath], event.body.retailerId.toString(10)),
          'test',
          AWS.config.credentials as Credentials,
          process.env.AWS_REGION!
        ),
        axiosRequest(
          new GetPipelineRulesRequest('test'),
          'test',
          AWS.config.credentials as Credentials,
          process.env.AWS_REGION!
        )
    ] as const);

    if (!catalogRulesResp.data.success) {
        return catalogRulesResp.data;
    } else if (!allRulesResp.data.success) {
        return allRulesResp.data;
    }

    const cols: Record<string, DscoColumn> = {};
    for (const rule of catalogRulesResp.data.rules) {
        parsePipelineRule(rule, cols);
    }

    for (const dscoRule of allRulesResp.data.dsco || []) {
        if (dscoRule.objectType === 'catalog') {
            parsePipelineRule(dscoRule, cols);
        }
    }

    const {sheets, drive, cleanupGoogleApis} = await prepareGoogleApis();

    const spreadsheet = new DscoSpreadsheet('Generated Catalog Spreadsheet');
    for (const colName in cols) {
        spreadsheet.addColumn(cols[colName]);
    }

    const url = await spreadsheet.createSpreadsheet(sheets, drive);

    await cleanupGoogleApis();

    return {
        success: true,
        url
    };
});

function parsePipelineRule(rule: PipelineRule, cols: Record<string, DscoColumn>): void {
    function ensureCol(field: string): DscoColumn {
        let result = cols[field];
        if (!result) {
            result = cols[field] = new DscoColumn(field);

            if (rule.attrType === 'custom') { // Custom attributes should default to info, not none
                result.validation.required = XrayActionSeverity.info;
            }
        }
        return result;
    }

    function setValidation<K extends keyof DscoColValidation>(field: string, key: K, value: DscoColValidation[K]): void {
        const col = ensureCol(field);
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
            setValidation(field, 'required', rule.severity);
        }
    } else if (rule.type === 'enum_match' || rule.type === 'catalog_enum_match') {
        const col = ensureCol(rule.field);
        col.validation.format = 'enum';
        col.validation.enumVals = rule.values;
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
                const col = ensureCol(rule.field);
                col.validation.format = 'array';
                col.validation.arrayType = rule.arrayDataType;
                break;
            }
            default: return;
        }
    } else if (rule.type === 'range' && rule.severity !== XrayActionSeverity.info) {
        const col = ensureCol(rule.field);
        col.validation.min = rule.min;
        col.validation.max = rule.max;
    } else if ((rule.type === 'length_range' || rule.type === 'catalog_length_range') && rule.severity !== XrayActionSeverity.info) {
        const col = ensureCol(rule.field);
        col.validation.minLength = rule.minLength;
        col.validation.maxLength = rule.maxLength;
    } else if ((rule.type === 'pattern_match' || rule.type === 'catalog_pattern_match') && rule.severity !== XrayActionSeverity.info) {
        const col = ensureCol(rule.field);
        col.validation.match = rule.pattern;
        col.validation.regexMessage = rule.description || rule.message;
        console.error('GOT MESSAGE, ', rule.message);
    }  else if ((rule.type === 'multi_pattern' || rule.type === 'catalog_multi_pattern') && rule.severity !== XrayActionSeverity.info) {
        const col = ensureCol(rule.field);
        col.validation.match = rule.pattern;
        col.validation.dontMatch = rule.notPatterns;
        col.validation.regexMessage = rule.description || rule.message;
    } else if (rule.type === 'date_in_future' && rule.severity !== XrayActionSeverity.info) {
        setValidation(rule.field, 'dateInFuture', true);
    }
}
