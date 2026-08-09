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
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
