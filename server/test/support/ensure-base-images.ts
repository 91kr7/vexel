/**
 * Pulls the suite's base images before a whole pass, so the network work happens
 * once, in one process, instead of in every test file at the same time on a
 * daemon that was just pruned.
 *
 * The test files ensure what they need themselves as well — running one file
 * directly has to work too — but that check then costs a local inspect rather
 * than a pull.
 */
import { BASE_IMAGES, ensureBaseImages } from "./base-images.js";

await ensureBaseImages();
console.log(`base images ready: ${BASE_IMAGES.join(", ")}`);
