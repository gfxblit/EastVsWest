import { waitFor as baseWaitFor, waitForSilence as baseWaitForSilence } from './wait-utils.js';

export const waitFor = baseWaitFor;
export const waitForSilence = baseWaitForSilence;

export const DEFAULT_WAIT_TIMEOUT = 10000;
export const LONG_WAIT_TIMEOUT = 30000;
