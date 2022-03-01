'use strict';

import consulApi from 'consul';
import merge from 'lodash.merge';

const defaults = {
    host: 'consul01.ops',
    port: 8500,
    defaults: {
        token: '09946afa-5679-bb3b-b120-840459fc6be6',
        timeout: 30000
    },
    pathToConsulConfigPath: 'services/consulConfigPath',
    environmentVariableName: 'API_ENV', //TODO: why isn't this using NODE_ENV ?
    globalAttrName: 'global'
};

const consul = consulApi({
    host: defaults.host,
    port: defaults.port,
    promisify: true,
    defaults: defaults.defaults,
    secure: false
});

export const getConfig = async <T> (serviceName: string): Promise<T> => {

    const consulPath = await consul.kv.get(defaults.pathToConsulConfigPath);
    if (!consulPath) {
        throw new Error('Expected serviceConfigPath from Consul');
    }
    const serviceConfigPathVal = JSON.parse(consulPath.Value).value;
    if (!serviceConfigPathVal) {
        throw new Error('Expected serviceConfigPath from Consul to have a value');
    }
    const servicePath = serviceConfigPathVal.replace('{servicename}', serviceName);

    // If the servicesConfigPath starts with a "/" remove it since root is inferred by the node consul lib
    const path = servicePath.charAt(0) === '/' ? servicePath.substring(1) : servicePath;

    // Now go get the global settings, if there aren't any just use an empty obj
    const result = await consul.kv.get(`${path}/${defaults.globalAttrName}`);
    const parsedResults = result ? JSON.parse(result.Value) : {};

    // Now go get the environment-specific settings, if there aren't any use empty obj
    // const envSettings = await consul.kv.get(path + '/' + process.env[defaults.environmentVariableName]);
    let env = process.env[defaults.environmentVariableName];
    if (process.env.LEO_LOCAL === 'true') {
        env = `${env}-vpn`;
    }
    const envSettings = await consul.kv.get(`${path}/${env}`);

    // TODO: DON'T CHECK THIS IN
    // const envSettings = await consul.kv.get(path + '/' + 'test-tunnel');
    const parsedEnvSettings = envSettings ? JSON.parse(envSettings.Value) : {};

    //const merge = require('lodash.merge');

    const config: any = {};
    merge(config, merge({}, parsedResults, parsedEnvSettings));
    return config;
};

export const getValue = async (path: string): Promise<string> => {
    const result = await consul.kv.get(path);
    if (result?.Value) {
        return result.Value;
    } else {
        throw new Error(`unable to find consul value for ${path}`);
    }
}
