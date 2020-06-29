'use strict';

module.exports = {
    _global: {
        region: 'us-east-1',
    },
    _local: {},
    // eslint-disable-next-line sort-keys
    dev: {
        leoProfile: 'dsco-test',
        leosdk: {
            LeoFirehoseStream: 'TestBus-LeoFirehoseStream-1M8BJL0I5HQ34',
            LeoKinesisStream: 'TestBus-LeoKinesisStream-1XY97YYPDLVQS',
            LeoS3: 'testbus-leos3-1erchsf3l53le',
            Region: 'us-east-1',
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
        leosdk: {
            LeoFirehoseStream: 'TestBus-LeoFirehoseStream-1M8BJL0I5HQ34',
            LeoKinesisStream: 'TestBus-LeoKinesisStream-1XY97YYPDLVQS',
            LeoS3: 'testbus-leos3-1erchsf3l53le',
            Region: 'us-east-1',
        },
        profile: 'default',
    },
    // eslint-disable-next-line sort-keys
    staging: {
        leoProfile: 'dsco-staging',
        leosdk: {
            LeoFirehoseStream: 'StagingBus-LeoFirehoseStream-1XNB5CU9DAIRF',
            LeoKinesisStream: 'StagingBus-LeoKinesisStream-A4FQ23IVQ11K',
            LeoS3: 'stagingbus-leos3-1mta8a98wcbnc',
            Region: 'us-east-1',
        },
        profile: 'default',
    },
    // eslint-disable-next-line sort-keys
    prod: {
        leoProfile: 'dsco-prod',
        leosdk: {
            LeoFirehoseStream: 'ProdBus-LeoFirehoseStream-1GZRLNQ9YN9BK',
            LeoKinesisStream: 'ProdBus-LeoKinesisStream-1SZPWFHEKF669',
            LeoS3: 'prodbus-leos3-17uqyaemyrrxs',
            Region: 'us-east-1',
        },
        profile: 'default',
    },
};
