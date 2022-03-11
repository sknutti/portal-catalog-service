'use strict';

module.exports = {
    _global: {
        region: 'us-east-1',
    },
    _local: {},
    // eslint-disable-next-line sort-keys
    dev: {
        leoProfile: 'dsco-test',
        leoauth: {
            LeoAuth: 'TestAuth-LeoAuth-1OA6GK80E4BB8',
            LeoAuthIdentity: 'TestAuth-LeoAuthIdentity-9LT3M4KKW8VR',
            LeoAuthPolicy: 'TestAuth-LeoAuthPolicy-60MEU1B5ZKAS',
            LeoAuthUser: 'TestAuth-LeoAuthUser-OZ7R6RHZIPDY',
            Region: 'us-east-1',
        },
        leosdk: {
            LeoArchive: 'TestBus-LeoArchive-WUWG7N8OXG97',
            LeoCron: 'TestBus-LeoCron-OJ8ZNCEBL8GM',
            LeoEvent: 'TestBus-LeoEvent-FNSO733D68CR',
            LeoFirehoseStream: 'TestBus-LeoFirehoseStream-1M8BJL0I5HQ34',
            LeoKinesisStream: 'TestBus-LeoKinesisStream-1XY97YYPDLVQS',
            LeoS3: 'testbus-leos3-1erchsf3l53le',
            LeoSettings: 'TestBus-LeoSettings-YHQHOKWR337E',
            LeoStream: 'TestBus-LeoStream-R2VV0EJ6FRI9',
            LeoSystem: 'TestBus-LeoSystem-L9OY6AV8E954',
            Region: 'us-east-1',
        },
        elasticsearch: {
            AccountDomainEndpoint: 'search-account-test-24zc7k4nrcwra44odfw7jy4v44.us-east-1.es.amazonaws.com',
        },
    },
    drtest: {
        profile: 'default',
    },
    utest: {
        leoProfile: '',
        leosdk: {
            LeoFirehoseStream: 'dummyLeoFirehoseStream',
            LeoKinesisStream: 'dummyLeoKinesisStream',
            LeoS3: 'dummyLeoS3',
            Region: 'dummyRegion',
        },
        profile: 'default',
    },
    // eslint-disable-next-line sort-keys
    test: {
        leoProfile: 'dsco-test',
        leoauth: {
            LeoAuth: 'TestAuth-LeoAuth-1OA6GK80E4BB8',
            LeoAuthIdentity: 'TestAuth-LeoAuthIdentity-9LT3M4KKW8VR',
            LeoAuthPolicy: 'TestAuth-LeoAuthPolicy-60MEU1B5ZKAS',
            LeoAuthUser: 'TestAuth-LeoAuthUser-OZ7R6RHZIPDY',
            Region: 'us-east-1',
        },
        leosdk: {
            LeoArchive: 'TestBus-LeoArchive-WUWG7N8OXG97',
            LeoCron: 'TestBus-LeoCron-OJ8ZNCEBL8GM',
            LeoEvent: 'TestBus-LeoEvent-FNSO733D68CR',
            LeoFirehoseStream: 'TestBus-LeoFirehoseStream-1M8BJL0I5HQ34',
            LeoKinesisStream: 'TestBus-LeoKinesisStream-1XY97YYPDLVQS',
            LeoS3: 'testbus-leos3-1erchsf3l53le',
            LeoSettings: 'TestBus-LeoSettings-YHQHOKWR337E',
            LeoStream: 'TestBus-LeoStream-R2VV0EJ6FRI9',
            LeoSystem: 'TestBus-LeoSystem-L9OY6AV8E954',
            Region: 'us-east-1',
        },
        elasticsearch: {
            AccountDomainEndpoint: 'search-account-test-24zc7k4nrcwra44odfw7jy4v44.us-east-1.es.amazonaws.com',
        },
        profile: 'default',
    },
    // eslint-disable-next-line sort-keys
    staging: {
        leoProfile: 'dsco-staging',
        leoauth: {
            LeoAuth: 'StagingAuth-LeoAuth-13P2GCNOD3TYC',
            LeoAuthIdentity: 'StagingAuth-LeoAuthPolicy-1DMK28089LGSH',
            LeoAuthPolicy: 'StagingAuth-LeoAuthIdentity-A5WOUZQFJZC1',
            LeoAuthUser: 'StagingAuth-LeoAuthUser-1IVNIRH40AURC',
            Region: 'us-east-1',
        },
        leosdk: {
            LeoArchive: 'StagingBus-LeoArchive-FLJ11TK61LM0',
            LeoCron: 'StagingBus-LeoCron-2UVDDFZR2MCT',
            LeoEvent: 'StagingBus-LeoEvent-MMS1VQKHYE3A',
            LeoFirehoseStream: 'StagingBus-LeoFirehoseStream-1XNB5CU9DAIRF',
            LeoKinesisStream: 'StagingBus-LeoKinesisStream-A4FQ23IVQ11K',
            LeoS3: 'stagingbus-leos3-1mta8a98wcbnc',
            LeoSettings: 'StagingBus-LeoSettings-154YXMK35SY6X',
            LeoStream: 'StagingBus-LeoStream-1BVXCM5IGNFA4',
            LeoSystem: 'StagingBus-LeoSystem-ZRAGVB31ATR8',
            Region: 'us-east-1',
        },
        elasticsearch: {
            AccountDomainEndpoint: 'search-account-staging-yqzuebeb3xfzibc4wp4vkuep4m.us-east-1.es.amazonaws.com',
        },
        profile: 'default',
    },
    // eslint-disable-next-line sort-keys
    prod: {
        leoProfile: 'dsco-prod',
        leoauth: {
            LeoAuth: 'ProdAuth-LeoAuth-1A3VKHYBJ9GLS',
            LeoAuthIdentity: 'ProdAuth-LeoAuthIdentity-FCE15EHP5JS',
            LeoAuthPolicy: 'ProdAuth-LeoAuthPolicy-XLRC0D3EAQUC',
            LeoAuthUser: 'ProdAuth-LeoAuthUser-SD8EQDNF542U',
            Region: 'us-east-1',
        },
        leosdk: {
            LeoArchive: 'ProdBus-LeoArchive-K9UQKPSB7M93',
            LeoCron: 'ProdBus-LeoCron-CNT18F32S1UK',
            LeoEvent: 'ProdBus-LeoEvent-12AQ6PZNRRHNK',
            LeoFirehoseStream: 'ProdBus-LeoFirehoseStream-1GZRLNQ9YN9BK',
            LeoKinesisStream: 'ProdBus-LeoKinesisStream-1SZPWFHEKF669',
            LeoS3: 'prodbus-leos3-17uqyaemyrrxs',
            LeoSettings: 'ProdBus-LeoSettings-6FLTMJUIOS7Q',
            LeoStream: 'ProdBus-LeoStream-1RWIW0AV7AC0Y',
            LeoSystem: 'ProdBus-LeoSystem-1J1ZWZIGL7M3F',
            Region: 'us-east-1',
        },
        elasticsearch: {
            AccountDomainEndpoint: 'search-account-prod-it6b6m25qaghy4set6utwehoae.us-east-1.es.amazonaws.com',
        },
        profile: 'default',
    },
};
