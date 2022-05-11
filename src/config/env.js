/* eslint-disable max-len */
import Exchange from '../abis/Exchange';

import protocolDeployments from '@elasticswap/elasticswap/artifacts/deployments.json';
import tokenDeployments from '@elasticswap/token/artifacts/deployments.json';

const env = {
  contracts: [Exchange, protocolDeployments, tokenDeployments],
};

export default env;
