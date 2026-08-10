/**
 * `npm run test:registry -w server` — brings up the registry a run gets its
 * images from, and fills it.
 *
 * Why there is a registry at all: a registry exposed on the internet
 * occasionally does not answer, and when it does not, the failure lands on
 * whichever assertion happened to need an image — saying nothing whatever about
 * the product. This suite has lost `filesystem-browser`, `layer-build-cache`,
 * `images` and `container-create-run` to `production.cloudfront.docker.com …
 * EOF` that way, each of them passing on its own minutes later. So a run gets
 * its images from a registry of its own, on this machine, and no test reaches
 * Docker Hub.
 *
 * What this step does, all of it idempotent:
 *
 * - makes sure the daemon holds what it must (`npm run test:images`'s job, done
 *   here too so this command stands on its own), including `registry:2` — the
 *   one image that cannot come from the registry, since it is what the registry
 *   is run from;
 * - starts the registry container if one of ours is not already up, under a
 *   fixed name and carrying the ownership labels, so `npm run test:sweep` can
 *   remove it after a run that was killed;
 * - seeds into it every image the tests pull, from the daemon's own copy
 *   (`docker tag` + `docker push`, no network at all);
 * - builds the single-layer image and publishes the copy of it that the tests
 *   which contract "an image missing locally is fetched first" pull.
 *
 * Reusing an already-prepared registry is the normal case, not an error: that is
 * what lets one server test file, or one spec, be run directly.
 */
import { prepareRunRegistry } from "./base-images.js";

console.log(`test registry ready on ${await prepareRunRegistry()}`);
