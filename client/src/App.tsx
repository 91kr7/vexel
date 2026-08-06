import { Shell } from './shell/Shell';
import { ConnectionStatusProvider } from './shell/services/ConnectionStatusService';
import { DaemonEventStreamProvider } from './shell/services/EventStreamService';
import { ErrorReportingProvider } from './shell/services/ErrorReportingService';
import { ProgressProvider } from './shell/services/ProgressService';

function App() {
  return (
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConnectionStatusProvider>
          <DaemonEventStreamProvider>
            <Shell />
          </DaemonEventStreamProvider>
        </ConnectionStatusProvider>
      </ProgressProvider>
    </ErrorReportingProvider>
  );
}

export default App;
