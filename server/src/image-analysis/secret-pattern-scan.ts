// Secret-pattern scan over the whole layer history (REQ-67): paths matching
// common credential/secret path conventions, wherever they occur in the
// per-layer changesets — including a path later deleted and so absent from
// the final merged filesystem. A heuristic name/path match only, never a
// content-based verdict: it names the matched pattern and leaves the
// judgment to the operator. Pure computation over an already-computed
// ImageChangesets (ChangesetService, batch 13), no I/O of its own.
import type { ImageChangesets } from "./changeset-service.js";

interface SecretPattern {
  name: string;
  test: RegExp;
}

/** Common credential/secret path conventions; matched against the path only, never file content. */
const SECRET_PATTERNS: SecretPattern[] = [
  { name: "Environment file (.env)", test: /(^|\/)\.env(\..+)?$/i },
  { name: "Private key", test: /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.[a-z0-9]+)?$/i },
  { name: "Key or certificate material", test: /\.(pem|key|p12|pfx|jks)$/i },
  { name: "AWS credentials", test: /(^|\/)\.aws\/credentials$/i },
  { name: "SSH credentials", test: /(^|\/)\.ssh\/(id_[a-z0-9_]+|authorized_keys|known_hosts)$/i },
  { name: "npm auth token (.npmrc)", test: /(^|\/)\.npmrc$/i },
  { name: "PyPI credentials (.pypirc)", test: /(^|\/)\.pypirc$/i },
  { name: "Netrc credentials", test: /(^|\/)\.netrc$/i },
  { name: "Git credentials store", test: /(^|\/)\.git-credentials$/i },
  { name: "Docker registry auth", test: /(^|\/)\.docker\/config\.json$/i },
  { name: "Kubernetes config", test: /(^|\/)(\.kube\/config|kubeconfig)$/i },
  { name: "Service-account key", test: /service[-_]?account.*\.json$/i },
  { name: "Generic secrets/credentials file", test: /(^|\/)(secrets?|credentials)\.(ya?ml|json|env)$/i },
  { name: "htpasswd file", test: /(^|\/)\.?htpasswd$/i },
];

export interface SecretFinding {
  path: string;
  patternName: string;
  introducedLayerIndex: number;
  /** The layer that removed this path, if it is not present in the final merged filesystem. */
  removedLayerIndex?: number;
}

export interface LayerSecretScan {
  imageId: string;
  findings: SecretFinding[];
}

function matchSecretPattern(path: string): SecretPattern | undefined {
  return SECRET_PATTERNS.find((pattern) => pattern.test.test(path));
}

/**
 * Walks every layer's changeset paths in build order: a matching path's first
 * ('added') occurrence records the introducing layer; if a later layer
 * deletes it, the finding is emitted right away naming both layers (REQ-67);
 * a matching path never deleted is still reported once the walk ends, without
 * a `removedLayerIndex`.
 */
export function scanForSecretPaths(changesets: ImageChangesets): LayerSecretScan {
  const findings: SecretFinding[] = [];
  const introducedAt = new Map<string, number>();

  for (const layer of changesets.layers) {
    for (const entry of layer.paths) {
      const pattern = matchSecretPattern(entry.path);
      if (!pattern) continue;

      if (entry.status === "added") {
        introducedAt.set(entry.path, layer.layerIndex);
      } else if (entry.status === "deleted") {
        const introducedLayerIndex = introducedAt.get(entry.path);
        if (introducedLayerIndex === undefined) continue;
        findings.push({ path: entry.path, patternName: pattern.name, introducedLayerIndex, removedLayerIndex: layer.layerIndex });
        introducedAt.delete(entry.path);
      }
    }
  }

  for (const [path, introducedLayerIndex] of introducedAt) {
    const pattern = matchSecretPattern(path);
    if (!pattern) continue;
    findings.push({ path, patternName: pattern.name, introducedLayerIndex });
  }

  findings.sort((a, b) => a.path.localeCompare(b.path));
  return { imageId: changesets.imageId, findings };
}
