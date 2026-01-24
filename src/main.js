import { initNetwork } from './core/network.js';
import { initInput } from './core/input.js';
import { initState } from './core/state.js';

initState();
initNetwork();
initInput();

console.log('Game initialized');
