// Einstiegspunkt: Spielstand laden (oder neu anlegen) und Spiel starten.

import { defaultState, loadState } from './game/state.js';
import { startApp } from './ui/app.js';

const state = loadState() || defaultState();
startApp(state);
