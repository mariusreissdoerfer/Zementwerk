// Einstiegspunkt: Spielstand laden (oder neu anlegen) und Spiel starten.

import { defaultState, loadState } from './game/state.js?v=4';
import { startApp } from './ui/app.js?v=4';

const state = loadState() || defaultState();
startApp(state);
