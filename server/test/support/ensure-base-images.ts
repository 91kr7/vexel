/**
 * `npm run test:images -w server` — puts on the daemon what has to be on the
 * daemon: the images the fixtures build on, and the one image the run's own
 * registry is itself started from.
 *
 * The only step of the whole arrangement that is allowed to reach Docker Hub,
 * and only for what is genuinely not there yet. That it is a preliminary step of
 * a pass, and not something a test does, is the point: a registry exposed on the
 * internet occasionally does not answer, and this suite has lost whole specs to
 * exactly that. A refusal here stops a run before it starts, which says what it
 * is; the same refusal inside a test says nothing about the product.
 *
 * Paired with `npm run test:registry -w server`, which runs next and publishes
 * these same images in the run's own registry.
 */
import { BASE_IMAGES, ensureDaemonImages } from "./base-images.js";

await ensureDaemonImages();
console.log(`base images ready: ${BASE_IMAGES.join(", ")}`);
