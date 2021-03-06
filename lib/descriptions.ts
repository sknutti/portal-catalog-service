// Column descriptions generated from apidoc
export const descriptions: Record<string, string | undefined> = {
    product_status:
        "The status of the item, one of these values...\n* **pending**: The supplier is in the process of setting up the item within Dsco and it is\n  not ready for its trading partners to sell it.  Dsco will not export this item\n  in inventory update feeds to the supplier’s trading partners, but will export\n  this item in catalog feeds.\n\n* **active**: The supplier has completed item setup for this item and trading partners may now\n  sell the item when the item has positive quantity.\n\n* **discontinued_sell_through**: The supplier has discontinued the item but wants its trading partners to continue\n  to sell the item until the item's availableQuantity goes to zero.  Dsco will continue\n  to send inventory updates to the supplier’s trading partners if the supplier\n  continues to update the available quantity of the item.  At some point, it is\n  expected that the available quantity will go to zero and remain there.  However,\n  if the supplier should send a positive inventory quantity, it will be passed to its\n  trading partners.\n\n* **discontinued**: The item is discontinued and the supplier’s trading partners are not to sell any\n  more.  Dsco will export the item to the supplier’s trading partners via its\n  designated inventory update feed (file/API), setting the item’s quantity\n  to zero and overriding whatever value may be there.  Suppliers may continue to\n  send positive inventory quantity values for the item to Dsco and Dsco will store it,\n  however, Dsco will continue to send zero quantity available to the supplier’s\n  trading partners.",
    product_group:
        "A group identifier that, when multiple SKU's have the same product_group, the SKU's are options/variants of each other.\nFor example, if 5 SKU's have the product_group of '123456', they are all children of the same parent SKU.\nThis field is required whenever a parent-child relationship is defined.",
    product_title:
        'The title of the given product that describes all of the various options/variants as a group. This field is suggested whenever a parent-child relationship is defined.',
    dsco_trading_partner_id: "The partner's unique ID for the supplier that owns this item",
    dsco_trading_partner_name: "The partner's name for the supplier that owns this item",
    dsco_last_product_status_update_date: 'The last time the product status was updated',
    title: "The title of the SKU.\nA common practice is to concatenate this data with other fields (such as manufacturer and brand)\nto end up with a more complete title (e.g. 'Lenovo Thinkpad T410 Notebook').",
    description:
        'Full description that describes the SKU. HTML can be used although great care should be taken to ensure proper closing of any and all HTML tags.',
    short_description:
        'A shortened description of the SKU. HTML can be used although great care should be taken to ensure proper closing of any and all HTML tags.',
    short_text_description:
        'A shortened text-only description of the SKU without the use of HTML or any other markup.\nTypically used for another medium (such as a point-of-sale system or mobile app).\nIf short_description is also included, the content should be the same, other than markup.',
    long_text_description:
        'A full text-only description of the SKU without the use of HTML or any other markup.\nTypically used for another medium (such as a point-of-sale system or mobile app).\nIf long_description is also included, the content should be the same, other than markup.',
    details:
        'Additional details not provided in the product description. In most cases, you should consider including this within the product description.',
    currency_code: 'The 3 letter ISO 4217 currency code (e.g. USD).',
    brand: "The name of the SKU's brand.",
    commission_percentage:
        'The percentage the supplier has set for the given trading partner to calculate the commission amount for an item when sold.',
    commission_amount:
        'The monetary amount the retailer will pay to the supplier when purchasing the item. Calculated as MSRP x Commission Percentage.',
    product_availability_start_date:
        'The date the item can start being ordered.\nDsco will automatically set the given item to "active" on this date as long as all required fields are set appropriately.',
    product_availability_end_date:
        'The date the item can no longer be ordered.\nDsco will automatically set the given item to "discontinued_sell_through" status on this date if\npositive quantity is available on the item or to "discontinued" status if zero quantity is available.',
    cost: 'The price of the SKU you are charging your retailers.\nWhen pricing tiers are used, this would be considered the default price.',
    dsco_last_cost_update_date: 'The date that the SKUs cost was last updated by the supplier.',
    msrp: "The Manufacturer's Recommended Retail Price (MSRP) .",
    map: 'The Minimum Advertised Price (MAP).',
    handling_cost: 'The handling costs or fees that will be added to the order when this SKU is purchased.',
    size_primary_nrf_code: "The primary size of the item matched to NRF's available Size Codes.",
    size_primary_description: 'Human readable description of the primary size of the item.',
    size_secondary_nrf_code: "The secondary size of the item matched to NRF's available Size Codes.",
    size_secondary_description: 'Human readable description of the secondary size of the item.',
    color_primary_nrf_code: "The primary color of the item matched to NRF's available Color Codes.",
    color_primary_description: 'Human readable description of the primary color.',
    color_secondary_nrf_code: "The secondary color of the item matched to NRF's available Color Codes.",
    color_secondary_description: 'Human readable description of the secondary color.',
    color_tertiary_nrf_code: "The tertiary color of the item matched to NRF's available Color Codes.",
    color_tertiary_description: 'Human readable description of the tertiary color.',
    hazmat_flag: 'Does the item contain hazardous materials?',
    hazmat_class_code:
        "If the item contains hazardous materials, what is the governing body's code that matches the item in question?",
    hazmat_description: 'Human readable description of the hazardous material within the item.',
    weight: 'The weight of the SKU.',
    weight_units: "The unit of weight used with the 'weight' field. Possible values include: 'lb', 'oz', 'g', 'kg'",
    length: 'The length of the SKU.',
    width: 'The width of the SKU.',
    height: 'The height of the SKU.',
    dimension_units:
        "The unit of length used with the dimension (length, height, depth) columns. Possible values include: 'in', 'ft', 'mm', 'cm', 'm'",
    package_weight: 'The weight of the item when packaged for shipment.',
    package_weight_units: 'Specifies the unit of measurement for the Package Weight value.',
    package_length: 'The length of the package.',
    package_height: 'The height of the package.',
    package_width: 'The width of the package.',
    package_dimension_units: 'Specifies the unit of measurement for the package dimensions.',
    accessory_skus: 'A list of accessories associated with this item',
    warranty: 'Brief warranty description.',
    assortments: "The list of the supplier's assortments this item is a member of",
    country_of_origin: 'The country of origin using the two-alpha-character ISO country code (eg. US).',
    postal_carrier_service_flag: 'Indicates whether the SKU can be shipped via postal carriers such as USPS.',
    ground_carrier_service_flag:
        'Indicates whether the SKU can be shipped via ground level service using carriers that support ground methods, such as FedEx or UPS.',
    air_carrier_service_flag:
        'Indicates whether the SKU can be shipped via air level service using carriers that support air methods, such as FedEx or UPS.',
    freight_carrier_service_flag:
        'Indicates whether the SKU can be shipped via freight level service using carriers that support air methods, such as FedEx or UPS.',
    average_postal_carrier_service_cost: 'The average cost to ship the SKU via postal service carriers such as USPS.',
    average_ground_carrier_service_cost:
        'The average cost to ship the SKU via ground service carriers such as FedEx and UPS.',
    average_air_carrier_service_cost:
        'The average cost to ship the SKU via air service carriers such as FedEx and UPS.',
    average_freight_carrier_service_cost: 'The average cost to ship the SKU via freight service carriers.',
    ships_alone_flag: 'Must the SKU always be shipped by itself?',
    max_ship_single_box: 'Maximum number of this SKU that will fit in a single package.',
    condition: 'The condition of the SKU.',
    cross_sell_skus: 'Other SKUs that are similar to or sell well with this SKU.',
    purchased_together_skus: 'SKUs that are usually purchased together when this SKU is purchased.',
    keywords: 'Keywords associated with the given SKU, to be used for marketing purposes by the retailer.',
    featured_sku_flag: 'Indicates that this SKU is featured by the Supplier.',
    gift_wrap_available_flag: 'Is gift wrapping available for this SKU?',
    pers_available_flag: 'Is personalization available for this SKU?',
    pers_num_lines: 'If personalization is available, how many lines are supported?',
    pers_char_per_line: 'If personalization is available, how many characters are allowed per line?',
    pers_description: 'The description of the personalization that is available in human readable format.',
    pers_ship_lead_time:
        "The unit for the lead time. If the lead time is '5 business days', the value for this column would be '5'.",
    pers_ship_lead_time_type:
        "The description of the lead time. If the lead time is '5 business days', the value for this column would be 'business days'.",
    manufacture_cost:
        "The supplier's cost of the item.\nThis value is only shared with Dsco, not to the suppliers trading partners.\nThis allows Dsco to provide profit reports to suppliers.",
};
