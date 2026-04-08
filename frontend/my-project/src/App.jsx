import { Routes, Route } from "react-router-dom";

import Layout          from "./components/Layout";
import Dashboard       from "./pages/Dashboard";
import PatientRecords  from "./pages/PatientRecords";
import AddPatientPage  from "./pages/AddPatientPage";
import ViewPatientPage from "./pages/ViewPatientPage";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"               element={<Dashboard />} />
        <Route path="/patients"       element={<PatientRecords />} />
        <Route path="/add-patient"    element={<AddPatientPage />} />
        <Route path="/view-patient/:id/:sampleId" element={<ViewPatientPage />} />
      </Routes>
    </Layout>
  );
}

export default App;