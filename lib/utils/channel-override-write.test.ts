import { overridesSmallBatch } from '@lib/utils/channel-override-write';
import { ChannelOverride } from '@dsco/bus-models/dist/item';
import { RetailModel } from '@dsco/bus-models/dist/retail-model';
/**
 * Test will only send to data stream queue if forceExit: is set to false in jest config
 */
test.skip('expect overridesSmallBatch to work', async () => {
    const override: ChannelOverride = {
        dscoItemId: '1052110350',
        replacements: {
            retailModels: [RetailModel.marketplace],
        },
    };
    const channelOverrides = [override];

    const ipAddress = '0.1.1.3';
    const retailerId = '1000040297';
    const awsReqId = '1234567890';
    const correlationId = ' 9876543231';

    await overridesSmallBatch(channelOverrides, ipAddress, retailerId, awsReqId, correlationId);
});
