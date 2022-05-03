This is in support of a supplier being able to upload a "catalog" or set of items to a retailer's catalog. This is the prototype of the inverse workflow.

As of right now, there is one S3Bucket(`fanatics-short-term-project-01`) that Fanatics "Supplier" can load into. In that bucket are 2 paths that correspond to environments (`prod` & `staging`). Within those buckets, there can exist more paths which would correspond to the retailer's Id. so the path structure would resemble `fanatics-short-term-project-01/staging/1000007723`.

The environments settings are in `/libs/fanatics.ts`. They would resemble: 
```
staging: {
    // AAFES
    1000007723: {
        retailerId: 1000007723,
        supplierId: 1000007967,
        userId: 1000011189,
        categoryPath: 'Fan Gear cat1560015',
    },
```

So Fanatics uploading to the path above would trigger setting the metadata from the environments settings and be copied over to the `portal-catalog-{env}` bucket. Once there, the `publish-category-spreadsheet-bot` bot will process the items against the category set in `categoryPath` in the retailer's catalog

*Note Well* The supplier Ids can be different for each block. I.E. fanatics has one supplierId for dealing with Nordstrom and another for dealing with AAFES.