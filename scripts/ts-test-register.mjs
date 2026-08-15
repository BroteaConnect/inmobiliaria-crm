// Entry point for `node --import ./scripts/ts-test-register.mjs --test …`.
// Registering the hooks needs its own module: `register()` loads the hook file
// in a separate thread, so it cannot live in the same file that calls it.
import { register } from 'node:module';

register('./ts-test-hooks.mjs', import.meta.url);
