import '@jest/globals';
import fetch, { Response } from 'node-fetch';

global.fetch = fetch;
global.Response = Response;
