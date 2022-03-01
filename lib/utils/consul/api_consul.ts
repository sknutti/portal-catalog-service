'use strict';

import * as consulSecrets from './secrets_manager_consul';

const SERVICE_NAME = 'ApiMicroservice';

let configLock = false;
const apiConfig: Record<string, ApiConsulConfig> = {};

export const getConfig = async (serviceName = SERVICE_NAME): Promise<ApiConsulConfig> => {
    if (!configLock && !apiConfig[serviceName]) {
        configLock = true;
        try {
            apiConfig[serviceName] = await consulSecrets.getConfig<ApiConsulConfig>(serviceName);
            // console.log('storing config for: ' + serviceName);
        } catch (e) {
            throw new Error(`Unable to contact Consul: ${e}`);
        } finally {
            configLock = false;
        }
    }
    while (!apiConfig[serviceName]) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    return apiConfig[serviceName];
};

export const getValue = async (path: string): Promise<string> => {
    return consulSecrets.getValue(path);
}

export interface ApiConsulConfig {
    change_log: {
        cleanup_interval_days: number;
        request_delay_seconds: number;
    }
    // TODO: fill in type
    [key: string]: any;
}
