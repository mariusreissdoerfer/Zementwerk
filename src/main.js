// Einstiegspunkt: Spielstand laden (oder neu anlegen) und Spiel starten.

import { defaultState, loadState } from './game/state.js?v=9';
import { startApp } from './ui/app.js?v=9';

const state = loadState() || defaultState();
startApp(state);
