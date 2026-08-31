/*
 * Vexel — Copyright (C) 2026 Christian Mariani
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Licensed under the GNU Affero General Public License v3, supplemented by the
 * additional terms permitted under its section 7 — attribution, marking of modified
 * versions and the project name. See LICENSE and LICENSE-ADDITIONAL-TERMS.md at the
 * repository root.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/foundation.css'
import { setTimingScale } from './timing/timing-scale'
import { readTimingScale } from './timing/timing-scale-client'

// Order is load-bearing (plan-docker_management_app-timing_scale/REQ-8): a cadence is a module-level
// constant, so a static import of the application here would fix every one before the factor arrives.
async function bootstrap(): Promise<void> {
  setTimingScale(await readTimingScale())
  const { default: App } = await import('./App.tsx')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
