import { overridesSmallBatch } from '@lib/utils/channel-override-write';
import { ChannelOverride } from '@dsco/bus-models/dist/item';
import { RetailModel } from '@dsco/bus-models/dist/retail-model';
/**
 * TEST the thing to see that next function runs the correct number of times
 * Mock function to not add garbage to db
 * Test once to see that is adds to db
 */
test('expect overridesSmallBatch to work',async () => {
    const override: ChannelOverride = {
        dscoItemId:'1052110350',
        replacements:{
            retailModel: RetailModel.marketplace
        }
    };
    const channelOverrides = [override];

    const ipAddress = '0.1.1.1';
    const retailerId = '1000040297';
    const awsReqId = '1234567890';
    const correlationId = ' 9876543231';

    await overridesSmallBatch(channelOverrides,ipAddress,retailerId,awsReqId,correlationId);
});

