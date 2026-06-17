import { useRef, useState } from 'react';
import './UploadZone.css';

export default function UploadZone({ onFiles, loading }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (!loading) onFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!loading) setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleChange = (e) => {
    if (!loading && e.target.files.length > 0) {
      onFiles(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div
      className={`upload-zone ${dragging ? 'dragging' : ''} ${loading ? 'uploading' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !loading && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && !loading && inputRef.current?.click()}
      aria-label="Upload DOCX files"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.doc"
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
      />

      <div className="upload-content">
        {loading ? (
          <>
            <div className="upload-spinner" />
            <p className="upload-title">Analysing programs&hellip;</p>
            <p className="upload-sub">Checking compliance criteria</p>
          </>
        ) : (
          <>
            <div className="upload-icon-wrap">
              <svg className="upload-icon" viewBox="0 0 48 48" fill="none">
                <rect x="8" y="4" width="28" height="36" rx="3" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
                <rect x="12" y="4" width="24" height="36" rx="3" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
                <path d="M24 28V18M24 18L20 22M24 18L28 22" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18 32h12" stroke="var(--red)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="upload-title">
              {dragging ? 'Drop to analyse' : 'Upload Program Documents'}
            </p>
            <p className="upload-sub">
              Drag &amp; drop or <span className="upload-link">browse files</span>
            </p>
            <div className="upload-formats">
              <span className="format-badge">.docx</span>
              <span className="format-divider">·</span>
              <span className="upload-hint">Multiple files supported</span>
            </div>
          </>
        )}
      </div>

      <div className="upload-criteria-hint">
        <p className="criteria-label">Checking for</p>
        <div className="criteria-chips">
          {['Calendar Year','Unit Description','Syllabus Outcomes','Duration','Stage/Year','Syllabus Content','T&L Activities','Learning Intentions','Subject Requirements','Resources'].map(c => (
            <span key={c} className="criteria-chip">{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
