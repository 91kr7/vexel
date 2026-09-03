import { Shell } from './shell/Shell';
import { ToastProvider } from './ui';
import { ConnectionStatusProvider } from './shell/services/ConnectionStatusService';
import { CrossNavigationProvider } from './shell/services/CrossNavigationService';
import { DaemonEventStreamProvider } from './shell/services/EventStreamService';
import { ErrorReportingProvider } from './shell/services/ErrorReportingService';
import { ProgressProvider } from './shell/services/ProgressService';

function App() {
  return (
    <ToastProvider>
      <ConnectionStatusProvider>
        <ErrorReportingProvider>
          <ProgressProvider>
            <DaemonEventStreamProvider>
              <CrossNavigationProvider>
                <Shell />
              </CrossNavigationProvider>
            </DaemonEventStreamProvider>
          </ProgressProvider>
        </ErrorReportingProvider>
      </ConnectionStatusProvider>
    </ToastProvider>
  );
}

export default App;
