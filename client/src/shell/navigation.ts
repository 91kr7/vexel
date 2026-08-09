export type NavGroupName = 'Workloads' | 'Artifacts' | 'Environment' | 'Full coverage';

export interface ScreenDefinition {
  id: string;
  label: string;
  glyph: string;
  group: NavGroupName;
  title: string;
  description: string;
}

/**
 * The thirteen screens of the application shell, grouped as shown in the
 * navigation rail. Later batches replace each placeholder screen; this list
 * is the single source of truth for navigation entries and page headers.
 */
export const screens: ScreenDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    glyph: 'DB',
    group: 'Workloads',
    title: 'Dashboard',
    description: 'Live overview of the daemon on default (local)',
  },
  {
    id: 'containers',
    label: 'Containers',
    glyph: 'CN',
    group: 'Workloads',
    title: 'Containers',
    description: 'Lifecycle, logs, stats, exec, processes and inspect',
  },
  {
    id: 'compose',
    label: 'Compose',
    glyph: 'CP',
    group: 'Workloads',
    title: 'Compose',
    description: 'Stacks, services and compose lifecycle',
  },
  {
    id: 'swarm',
    label: 'Swarm',
    glyph: 'SW',
    group: 'Workloads',
    title: 'Swarm',
    description: 'Nodes, services and swarm-wide operations',
  },
  {
    id: 'images-layers',
    label: 'Images & layers',
    glyph: 'IM',
    group: 'Artifacts',
    title: 'Images & layers',
    description: 'Image registry actions, transport and layer inspection',
  },
  {
    id: 'volumes-networks',
    label: 'Volumes & networks',
    glyph: 'VN',
    group: 'Artifacts',
    title: 'Volumes & networks',
    description: 'Storage and connectivity resources',
  },
  {
    id: 'registries',
    label: 'Registries',
    glyph: 'RG',
    group: 'Artifacts',
    title: 'Registries',
    description: 'Configured registries and authentication',
  },
  {
    id: 'builders-cache',
    label: 'Builders & cache',
    glyph: 'BX',
    group: 'Artifacts',
    title: 'Builders & cache',
    description: 'Buildx builders and build-cache usage',
  },
  {
    id: 'contexts',
    label: 'Contexts',
    glyph: 'CX',
    group: 'Environment',
    title: 'Contexts',
    description: 'Daemon contexts and connection targets',
  },
  {
    id: 'plugins',
    label: 'Plugins',
    glyph: 'PL',
    group: 'Environment',
    title: 'Plugins',
    description: 'CLI and daemon plugins with their status',
  },
  {
    id: 'system-prune',
    label: 'System & prune',
    glyph: 'SY',
    group: 'Environment',
    title: 'System & prune',
    description: 'Disk usage overview and prune operations',
  },
  {
    id: 'raw-console',
    label: 'Raw console',
    glyph: '>_',
    group: 'Full coverage',
    title: 'Raw console',
    description: 'Direct Docker API and CLI-equivalent commands',
  },
  {
    // The id stays `coverage-matrix`: it is what the last-active-screen
    // preference of an earlier version holds, so renaming the screen must not
    // reach it (REQ-2).
    id: 'coverage-matrix',
    label: 'About',
    glyph: 'AB',
    group: 'Full coverage',
    title: 'About',
    description: 'Product identity and licence, and the functional coverage matrix against the Docker CLI and API',
  },
];

export const navGroupOrder: NavGroupName[] = ['Workloads', 'Artifacts', 'Environment', 'Full coverage'];

export const defaultScreenId = 'dashboard';
