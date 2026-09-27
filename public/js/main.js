// Entry point (lead owner). Wires every module to the bus. No game logic here.
import * as world from './scene/world.js';
import * as shower from './scene/shower.js';
import * as founder from './scene/founder.js';
import * as vcs from './scene/vcs.js';
import * as ice from './scene/ice.js';
import * as endings from './scene/endings.js';
import * as stt from './voice/stt.js';
import * as buzzword from './voice/buzzword.js';
import * as tts from './voice/tts.js';
import * as hud from './voice/hud.js';
import * as state from './state.js';
import * as debug from './debug.js';

const w = world.init(document.getElementById('stage'));
for (const m of [shower, founder, vcs, ice, endings]) m.init(w);
for (const m of [stt, buzzword, tts, hud]) m.init();
state.init();
debug.init();
