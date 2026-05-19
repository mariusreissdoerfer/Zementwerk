// Einstiegspunkt: Spielstand laden (oder neu anlegen) und Spiel starten.

import { defaultState, loadState } from './game/state.js?v=13';
import { startApp } from './ui/app.js?v=13';

const state = loadState() || defaultState();
startApp(state);
