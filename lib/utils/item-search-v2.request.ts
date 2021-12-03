import { DscoEnv, DsError, DsRequest, DsResponse, Item, SnakeCase } from '@dsco/ts-models';

type FilterType = 'OR' | 'AND';

interface Range {
    min?: number | string; // inclusive
    max?: number | string; // exclusive
}
interface ExtendedAttributeSearch {
    retailerId: number;
    attributes: { [attributeName: string]: Range | number[] | string[] };
    filterType: FilterType;
}
interface WarehouseSearch {
    codes?: string[]; //
    ids?: string[]; //
    filterType: FilterType;
}
interface ImageSearch {
    createDate?: Range | string;
    lastUpdate?: Range | string;
    hasAtLeastOneImage?: string[];
    doesntHaveAnyImages?: string[];
    successfullyGeneratedImagesFor?: string[];
}
export interface ItemSearchFiltersV2 {
    objectType: 'PRODUCT' | 'ITEM';
    term?: string;
    inAssortments?: string[];
    notInAssortments?: string[];
    notInAnyAssortment?: boolean;
    categories?: [
        {
            retailerId: number;
            paths: string[];
            includeItemsInChildCategories: boolean;
            filterType: FilterType;
        },
    ];
    extendedAttributes?: ExtendedAttributeSearch;
    /**
     * If true, returns items with a partner sku.  If false, returns items missing a partner sku
     */
    hasPartnerSku?: boolean;
    listingStatus?: 'listed' | 'not_listed';
    tradingPartners?: number[];
    warehouses?: WarehouseSearch;
    images?: ImageSearch;
    sortBy?: {
        field: string;
        direction: 'asc' | 'desc';
    };
    status?: Array<'in-stock' | 'out-of-stock' | 'discontinued' | 'unknown' | 'incomplete' | 'hidden'>;
    productStatus?: Array<'pending' | 'active' | 'assumed_active' | 'discontinued' | 'discontinued_sell_through'>;
    retailerId?: number;
    supplierId?: number;
}

export interface ItemSearchBodyV2<FULL_DETAIL extends boolean = true> extends ItemSearchFiltersV2 {
    version: 2;
    fullDetail?: FULL_DETAIL;
    paginationKey?: unknown;
    pageNumber?: number;
    pageSize?: number;
}

export interface ItemSearchV2Response<FULL_DETAIL extends boolean = true> extends DsResponse {
    docs: FULL_DETAIL extends true ? Array<SnakeCase<Item>> : Array<number>;
    products?: Array<{ firstItem: SnakeCase<Item>; total: number }>;
    paginationKey?: unknown; // If provided, means there were more items to grab
    pageNumber?: number;
    duration: number; // in ms
    hits: number;
}

// TODO: This should be added to the @dsco/search-apis project
export class ItemSearchV2Request<FULL_DETAIL extends boolean = true> extends DsRequest<ItemSearchBodyV2<FULL_DETAIL>, ItemSearchV2Response<FULL_DETAIL>, DsError> {
    constructor(env: DscoEnv, body: ItemSearchBodyV2<FULL_DETAIL>) {
        super('POST', '/item/api/search', DsRequest.getHost(env, 'apps'), body);
    }
}
