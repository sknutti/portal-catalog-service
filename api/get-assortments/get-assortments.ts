import { apiWrapper, getUser } from '@dsco/service-utils';
import { UnauthorizedError } from '@dsco/ts-models';
import { GetAssortmentsGearmanApi } from '@lib/requests/get-assortments.gearman-api';
import { GetAssortmentsRequest } from './get-assortments.request';

export const getAssortments = apiWrapper<GetAssortmentsRequest>(async (event) => {
    const user = await getUser(event.requestContext, process.env.AUTH_USER_TABLE!);

    // Must be logged in
    if (!user?.accountId) {
        return new UnauthorizedError();
    }

    return new GetAssortmentsGearmanApi({
        account_id: user.accountId.toString(10),
        user_id: user.userId.toString(10),
        account_type: user.identities.includes('role/retailer') ? 'retailer' : 'supplier'
    }, {
        fresh: true
    }).submit();
});
