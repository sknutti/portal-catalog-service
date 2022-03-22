import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { getLeoAuthUserTable } from '@lib/environment';
import { GetAssortmentsGearmanApi } from '@lib/requests';
import { GetAllAssortmentsRequest } from './get-all-assortments.request';

export const getAllAssortments = apiWrapper<GetAllAssortmentsRequest>(async (event) => {
    if (!event.body.account_ids) {
        return new MissingRequiredFieldError('account_ids');
    }

    const { account_ids } = event.body;

    const user = await getUser(event.requestContext, getLeoAuthUserTable());

    // Must be logged in
    if (!user?.accountId) {
        return new UnauthorizedError();
    }

    return new GetAssortmentsGearmanApi(
        {
            account_id: user.accountId.toString(10),
            user_id: user.userId.toString(10),
            account_type: user.identities.includes('role/retailer') ? 'retailer' : 'supplier',
        },
        {
            fresh: true,
            account_ids: account_ids.map((account_id) => account_id.toString(10)),
        },
    ).submit();
});
