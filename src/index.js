/**
 * FEES BOT
 *
 * TODO: add and account for new exchanges
 * TODO: account for fee distribution
 */

import 'dotenv/config';
import { Client, Intents } from 'discord.js';
import { ethers } from 'ethers';
import elasticSwap from '@elasticswap/sdk';
import customFetch from 'node-fetch';
import logdna from '@logdna/logger';

import chains from './config/chains';
import env from './config/env';
import RedisAdapter from './adapters/RedisAdapter';

const logger = logdna.createLogger(process.env.LOG_DNA_KEY, { app: 'Discord Fees Bot' });

const debug = (message) => {
  console.log(message);
  logger.debug(message);
};

const error = (message, e) => {
  console.log(message, 'ERROR:', e.message);
  logger.debug(message, { meta: e });
};

const info = (message) => {
  console.log(message);
  logger.info(message);
};

const { toBigNumber } = elasticSwap.utils;

const LISTS = [
  'https://raw.githubusercontent.com/ElasticSwap/tokenlists/master/defi.tokenlist.json',
  'https://raw.githubusercontent.com/ElasticSwap/tokenlists/master/elastic.tokenlist.json',
  'https://raw.githubusercontent.com/ElasticSwap/tokenlists/master/stablecoin.tokenlist.json',
];

const storageAdapter = new RedisAdapter();

const avalanche = new elasticSwap.SDK({
  customFetch,
  env,
  provider: new ethers.providers.JsonRpcProvider(chains[0].rpcUrl),
  storageAdapter,
});

const ethereum = new elasticSwap.SDK({
  customFetch,
  env,
  provider: new ethers.providers.JsonRpcProvider(chains[1].rpcUrl),
  storageAdapter,
});

const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});

const loadTokenLists = (sdk) => Promise.all(LISTS.map((url) => sdk.tokenList(url)));

const findtokenAddress = (lists, sym) => {
  const list = lists.find(({ tokens }) => tokens.find(({ symbol }) => symbol === sym));
  const token = list.tokens.find(({ symbol }) => symbol === sym);
  debug(`Found token address: ${sym} = ${token.address}`);
  return token.address;
};

const cachedCoingeckoPrices = {};

const loadPriceFromCoingecko = async (token) => {
  cachedCoingeckoPrices[token] = cachedCoingeckoPrices[token] || toBigNumber(0);

  try {
    const result = await customFetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=USD`,
    );
    const data = await result.json();
    cachedCoingeckoPrices[token] = toBigNumber(data[token].usd);
  } catch (e) {
    error(`Failed to fetch price from Coingecko for ${token}`, e);
  }

  return cachedCoingeckoPrices[token];
};

const calcBaseQuoteFees = async (exchange, basePrice, quotePrice, feeAddress) => {
  const [elp, totalSupply] = await Promise.all([
    exchange.balanceOf(feeAddress),
    exchange.totalSupply(),
  ]);

  const percentageOfELP = elp.dividedBy(totalSupply);
  const baseAmount = exchange.baseTokenBalance.multipliedBy(percentageOfELP);
  const quoteAmount = exchange.quoteTokenBalance.multipliedBy(percentageOfELP);
  return baseAmount
    .multipliedBy(basePrice)
    .plus(quoteAmount.multipliedBy(quotePrice))
    .multipliedBy(process.env.FEE_PERCENTAGE);
};

const calcBaseUSDCFees = (exchange, basePrice, feeAddress) =>
  calcBaseQuoteFees(exchange, basePrice, toBigNumber(1), feeAddress);

// get the usdc balances of the two fee addresses and then add to the sum of "Fees generated"  
// uSDC for ETH USDC.e for avalanche


client.on('ready', async () => {
  info(`${client.user.username} is ready!`);

  await Promise.all([avalanche.awaitInitialized(), ethereum.awaitInitialized()]);

  info('Avalance and Ethereum connected');

  const [avalancheTokenLists, ethereumTokenLists] = await Promise.all([
    loadTokenLists(avalanche),
    loadTokenLists(ethereum),
  ]);

  info('TokenLists loaded');

  const addresses = {
    avalanche: {
      AMPL: findtokenAddress(avalancheTokenLists, 'AMPL'),
      TIC: findtokenAddress(avalancheTokenLists, 'TIC'),
      USDCe: findtokenAddress(avalancheTokenLists, 'USDC.e'),
    },
    ethereum: {
      AMPL: findtokenAddress(ethereumTokenLists, 'AMPL'),
      FOX: findtokenAddress(ethereumTokenLists, 'FOX'),
      FOXy: findtokenAddress(ethereumTokenLists, 'FOXy'),
      TIC: findtokenAddress(ethereumTokenLists, 'TIC'),
      USDC: findtokenAddress(ethereumTokenLists, 'USDC'),
    },
  };

  // load exchanges

  const [aAMPLUSDCe, aAMPLTIC, aTICUSDCe, eAMPLUSDC, eFOXYFOX, eTICUSDC] = await Promise.all([
    avalanche.exchangeFactory.exchange(addresses.avalanche.AMPL, addresses.avalanche.USDCe),
    avalanche.exchangeFactory.exchange(addresses.avalanche.AMPL, addresses.avalanche.TIC),
    avalanche.exchangeFactory.exchange(addresses.avalanche.TIC, addresses.avalanche.USDCe),
    ethereum.exchangeFactory.exchange(addresses.ethereum.AMPL, addresses.ethereum.USDC),
    ethereum.exchangeFactory.exchange(addresses.ethereum.FOXy, addresses.ethereum.FOX),
    ethereum.exchangeFactory.exchange(addresses.ethereum.TIC, addresses.ethereum.USDC),
  ]);

  info('Exchanges loaded');
  info('---');

  const updateFees = async () => {
    info('Updating fees...');
    info('---');

    let usdFees = toBigNumber(0);
    const avalancheFeeAddress = process.env.AVALANCHE_FEE_ADDRESS.toLowerCase();
    const ethereumFeeAddress = process.env.ETHEREUM_FEE_ADDRESS.toLowerCase();

    // Pricing

    // AMPL
    const amplPrice = await eAMPLUSDC.priceOfBaseInQuote();
    info(`Price of AMPL: ${amplPrice.toFixed(6)}`);

    // FOX
    const foxPrice = await loadPriceFromCoingecko('shapeshift-fox-token');
    info(`Price of FOX: ${foxPrice.toFixed(6)}`);

    // FOXy
    const foxyPrice = (await eFOXYFOX.priceOfBaseInQuote()).multipliedBy(foxPrice);
    info(`Price of FOXy: ${foxyPrice.toFixed(6)}`);

    // TIC
    const ticPrice = await eTICUSDC.priceOfBaseInQuote();
    info(`Price of TIC: ${ticPrice.toFixed(6)}`);

    // Avalanche AMPL/USDC.e
    const aAMPLUSDCeFees = await calcBaseUSDCFees(aAMPLUSDCe, amplPrice, avalancheFeeAddress);
    usdFees = usdFees.plus(aAMPLUSDCeFees);
    info('---');
    info(`Avalanche AMPL/USDC.e Fees: ${aAMPLUSDCeFees.toFixed(6)}`);

    // Avalanche AMPL/TIC
    const aAMPLTICFees = await calcBaseQuoteFees(
      aAMPLTIC,
      amplPrice,
      ticPrice,
      avalancheFeeAddress,
    );
    usdFees = usdFees.plus(aAMPLTICFees);
    info(`Avalanche AMPL/TIC Fees: ${aAMPLTICFees.toFixed(6)}`);

    // Avalanche TIC/USDC.e
    const aTICUSDCeFees = await calcBaseUSDCFees(aTICUSDCe, ticPrice, avalancheFeeAddress);
    usdFees = usdFees.plus(aTICUSDCeFees);
    info(`Avalanche TIC/USDC.e Fees: ${aTICUSDCeFees.toFixed(6)}`);

    // Ethereum AMPL/USDC
    const eAMPLUSDCFees = await calcBaseUSDCFees(eAMPLUSDC, amplPrice, ethereumFeeAddress);
    usdFees = usdFees.plus(eAMPLUSDCFees);
    info(`Ethereum AMPL/USDC Fees: ${eAMPLUSDCFees.toFixed(6)}`);

    // Ethereum FOXy/FOX
    const eFOXYFOXFees = await calcBaseQuoteFees(eFOXYFOX, foxyPrice, foxPrice, ethereumFeeAddress);
    usdFees = usdFees.plus(eFOXYFOXFees);
    info(`Ethereum FOXy/FOX Fees: ${eFOXYFOXFees.toFixed(6)}`);

    // Ethereum TIC/USDC
    const eTICUSDCFees = await calcBaseUSDCFees(eTICUSDC, ticPrice, ethereumFeeAddress);
    usdFees = usdFees.plus(eTICUSDCFees);
    info(`Ethereum TIC/USDC Fees: ${eTICUSDCFees.toFixed(6)}`);

    // Ethereum USDC balance
    const eUSDCBalance =  await ethereum.erc20(addresses.ethereum.USDC).balanceOf(ethereumFeeAddress);
    usdFees = usdFees.plus(eUSDCBalance);
    info(`Ethereum Fee Multisig USDC Balance: ${eUSDCBalance}`);
   
    // Avax USDC.e balance
    const aUSDCBalance =  await avalanche.erc20(addresses.avalanche.USDCe).balanceOf(avalancheFeeAddress);
    usdFees = usdFees.plus(aUSDCBalance);
    info(`Avalance Fee Multisig USDC Balance: ${aUSDCBalance}`);
    info('---');
    info(`Total Fees: ${usdFees.toFixed(6)}`);
    info('---');

    if (!process.env.TESTING) {
      client.user.setActivity(`$${usdFees.toFixed(2)}`, { type: 'PLAYING' });
    }
  };

  // do it immediately on start
  updateFees();

  // Do it every n ms
  setInterval(() => updateFees(), process.env.POLL_INTERVAL);
});

client.login(process.env.FEE_BOT_AUTH_TOKEN);
