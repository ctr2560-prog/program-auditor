import { useState, useCallback } from 'react';
import { analyzeDocx } from './utils/analyzeDocument';
import UploadZone from './components/UploadZone';
import SummaryPanel from './components/SummaryPanel';
import AuditCard from './components/AuditCard';
import './App.css';

function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFiles = useCallback(async (files) => {
    setError(null);
    setLoading(true);
    try {
      const docxFiles = Array.from(files).filter(f =>
        f.name.endsWith('.docx') || f.name.endsWith('.doc')
      );
      if (docxFiles.length === 0) {
        setError('Please upload .docx files only.');
        setLoading(false);
        return;
      }
      const analyzed = await Promise.all(docxFiles.map(analyzeDocx));
      setResults(prev => [...prev, ...analyzed]);
    } catch (e) {
      setError('Failed to analyse one or more files. Please ensure they are valid .docx documents.');
      console.error(e);
    }
    setLoading(false);
  }, []);

  const clearAll = () => {
    setResults([]);
    setError(null);
  };

  const removeResult = (idx) => {
    setResults(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="app dot-bg">
      <header className="app-header">
        <div className="header-dots" />
        <div className="header-inner">
          <div className="school-logo-wrap">
            <img
              src="/logo.png"
              alt="Sarah Redfern High School"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.querySelector('.school-logo-initials').style.display = 'block';
              }}
            />
            <span className="school-logo-initials" style={{ display: 'none' }}>SRHS</span>
          </div>
          <span className="header-school">Sarah Redfern High School</span>
          <h1 className="header-main">Program Audit Analyser</h1>
          <span className="header-badge">T&amp;L Programs 2026</span>
        </div>
      </header>

      <main className="app-main">
        <section className="upload-section">
          <UploadZone onFiles={handleFiles} loading={loading} />
          {error && (
            <div className="error-banner">
              <span className="error-icon">⚠</span>
              {error}
            </div>
          )}
        </section>

        {results.length > 0 && (
          <>
            <SummaryPanel results={results} onClear={clearAll} />
            <section className="results-section">
              <div className="results-grid">
                {results.map((result, idx) => (
                  <AuditCard
                    key={`${result.fileName}-${idx}`}
                    result={result}
                    index={idx}
                    onRemove={() => removeResult(idx)}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>Sarah Redfern High School &mdash; T&amp;L Program Audit Tool &mdash; 2026</p>
      </footer>
    </div>
  );
}

export default App;
