import { ethers } from 'ethers';
import { EVM_RPC } from './env.js';

export const provider = new ethers.JsonRpcProvider(EVM_RPC, undefined, { batchMaxCount: 20 });
