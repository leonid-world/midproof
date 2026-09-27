import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  INDEXER_HTTP_URL,
  INDEXER_WS_URL,
  NETWORK_ID,
} from './config.js';
import { createEligibilityReader, type GetEligibilityResult } from './eligibility.js';
import { createContractStateQuery } from './indexer-query.js';

export function createLocalEligibilityReader(config: {
  networkId: 'undeployed' | 'preview'; indexer: string; indexerWS: string;
} = { networkId: NETWORK_ID, indexer: INDEXER_HTTP_URL, indexerWS: INDEXER_WS_URL }): GetEligibilityResult {
  setNetworkId(config.networkId);
  return createEligibilityReader({ queryContractState: createContractStateQuery(config.indexer) });
}
