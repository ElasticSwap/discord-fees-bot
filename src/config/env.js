/* eslint-disable max-len */

import protocolDeployments from '@elasticswap/elasticswap/artifacts/deployments.json';
import tokenDeployments from '@elasticswap/token/artifacts/deployments.json';
import Exchange from '../abis/Exchange';

const env = {
  contracts: [Exchange, protocolDeployments, tokenDeployments],
};

export default env;
