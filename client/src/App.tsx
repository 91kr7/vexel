import { Shell } from './shell/Shell';
import { ConnectionStatusProvider } from './shell/services/ConnectionStatusService';
import { CrossNavigationProvider } from './shell/services/CrossNavigationService';
import { DaemonEventStreamProvider } from './shell/services/EventStreamService';
import { ErrorReportingProvider } from './shell/services/ErrorReportingService';
import { ProgressProvider } from './shell/services/ProgressService';

function App() {
  return (
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConnectionStatusProvider>
          <DaemonEventStreamProvider>
            <CrossNavigationProvider>
              <Shell />
            </CrossNavigationProvider>
          </DaemonEventStreamProvider>
        </ConnectionStatusProvider>
      </ProgressProvider>
    </ErrorReportingProvider>
  );
}

export default App;
