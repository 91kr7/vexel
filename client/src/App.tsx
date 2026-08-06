import { Shell } from './shell/Shell';
import { ErrorReportingProvider } from './shell/services/ErrorReportingService';
import { ProgressProvider } from './shell/services/ProgressService';

function App() {
  return (
    <ErrorReportingProvider>
      <ProgressProvider>
        <Shell />
      </ProgressProvider>
    </ErrorReportingProvider>
  );
}

export default App;
