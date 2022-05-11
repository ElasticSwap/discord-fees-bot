import { SDK } from '@elasticswap/sdk';
import { ethers } from 'ethers';

import chains from './chains';
import env from './env';

const provider = new ethers.providers.JsonRpcProvider(chains[0].rpcUrl);

const sdk = new SDK({
  env,
  provider,
});

export { sdk, provider };
