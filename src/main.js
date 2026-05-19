// Einstiegspunkt: Spielstand laden (oder neu anlegen) und Spiel starten.

import { defaultState, loadState } from './game/state.js?v=11';
import { startApp } from './ui/app.js?v=11';

const state = loadState() || defaultState();
startApp(state);
