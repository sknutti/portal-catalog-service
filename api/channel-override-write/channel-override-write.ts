import { apiWrapper } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { CatalogItemOverridesSmallBatchRequest } from './channel-override-write.request';
// import { overridesSmallBatch } from '../../lib/utils/channel-override-write'; // TODO PMK-336 Uncomment this line

export const channelOverrideWrite = apiWrapper<CatalogItemOverridesSmallBatchRequest>(async (event) => {
    if (!event.body.retailerId) {
        return new MissingRequiredFieldError('retailerId');
    }
    if (!event.body.channelOverrides) {
        return new MissingRequiredFieldError('channelOverrides');
    }

    console.log(JSON.stringify(event.body, null, 4));

    // TODO PMK-336 take this out it is just here for the stub.
    if (Math.random() < 0.2) {
        console.log('Unlucky!');
        return new UnauthorizedError();
    }

    return {
        success: true,
        message: 'no actual work was done, this is just stubbed',
    };
});
