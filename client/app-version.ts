// The running version the client displays comes from the repository root
// `package.json` and from nowhere else.
//
// `client/package.json` and `server/package.json` stay at `0.0.0` on purpose:
// both are private and never published, so leaving them unversioned keeps a
// single place to bump and two version strings in this repository can never
// disagree about which build is running.
//
// It is read here, at config time, and injected as a build-time constant rather
// than fetched or asked of the server: displaying the version must cost no
// request, so the About notice is complete on a host with no outbound network
// (plan-docker_management_app-about_license_notice/REQ-15, REQ-19).
//
// Both the Vite config and the Vitest config spread `appVersionDefine`: without
// it in the second, the notice would render an undefined version under unit
// test while passing in the browser.
import { readFileSync } from 'node:fs';

export function readAppVersion(): string {
  const manifestUrl = new URL('../package.json', import.meta.url);
  const manifest: unknown = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  const version = (manifest as { version?: unknown }).version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('The repository root package.json declares no "version": the About notice has nothing to display.');
  }
  return version;
}

export const appVersionDefine = {
  __APP_VERSION__: JSON.stringify(readAppVersion()),
};
