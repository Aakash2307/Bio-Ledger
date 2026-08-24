import { useState } from "react";
import { Routes, Route } from "react-router-dom";

import Layout               from "./components/Layout";
import Dashboard            from "./pages/Dashboard";
import PatientRecords       from "./pages/PatientRecords";
import AddPatientPage       from "./pages/AddPatientPage";
import ViewPatientPage      from "./pages/ViewPatientPage";
import SampleTrackerList    from "./pages/SampleTracker/SampleTrackerList";
import SampleTrackerDetail  from "./pages/SampleTracker/SampleTrackerDetail";
import SequencingAnalysis   from "./pages/SequencingAnalysis";
import SplashScreen         from "./pages/SplashScreen";
import Reports              from "./pages/Reports";
import ReportAutomation     from "./pages/ReportAutomation";
import BioLedgerSpinner     from "./pages/BioledgerSpinner";
import VariantVisualization  from "./pages/VariantVisualization";



function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}

      <div style={{ opacity: splashDone ? 1 : 0, transition: "opacity 0.4s ease" }}>
        <Layout>
          <Routes>
            <Route path="/"                              element={<Dashboard />} />
            <Route path="/patients"                      element={<PatientRecords />} />
            <Route path="/add-patient"                   element={<AddPatientPage />} />
            <Route path="/view-patient/:id/:sampleId"    element={<ViewPatientPage />} />
            <Route path="/samples"                       element={<SampleTrackerList />} />
            <Route path="/samples/:sampleId"             element={<SampleTrackerDetail />} />
            <Route path="/sequencing"                    element={<SequencingAnalysis />} />
            <Route path="/reports"                       element={<Reports />} />
            <Route path="/sequencing/report-automation"  element={<ReportAutomation />} />
            <Route path="/variants"                      element={<VariantVisualization />} />
            <Route path="/spinner"                       element={<BioLedgerSpinner />} />
            
          </Routes>
        </Layout>
      </div>
    </>
  );
}

export default App;