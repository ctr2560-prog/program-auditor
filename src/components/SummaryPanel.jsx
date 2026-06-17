import './SummaryPanel.css';

const TIER_LABEL = { strong: 'Met', partial: 'To Refine', missing: 'Missing' };

function exportCSV(results) {
  const headers = [
    'Program',
    'Score',
    'Status',
    ...CRITERIA_HEADERS,
    'Notes',
  ];

  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;

  const rows = results.map((r) => {
    const displayName = r.fileName.replace(/\.(docx?)$/i, '');
    return [
      escape(displayName),
      escape(`${r.score}/${r.total}`),
      escape(r.status),
      ...r.criteriaResults.map((c) => escape(TIER_LABEL[c.tier] ?? c.tier)),
      escape(generateNote(r)),
    ].join(',');
  });

  const csv = [headers.map((h) => escape(h)).join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `program-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const CRITERIA_HEADERS = [
  'Calendar Year',
  'Unit Description',
  'Syllabus Outcomes',
  'Duration',
  'Stage or Year',
  'Relevant Syllabus Content',
  'Integrated Teaching & Learning Activities',
  'Learning Intentions & Success Criteria',
  'Subject Specific Requirements',
  'Resources',
];

// Short DP-voice note per criterion tier — mirrors the Excel notes column
const SHORT_NOTES = {
  calendarYear:        { missing: 'Calendar year missing',                              partial: 'Calendar year not prominent in header' },
  unitDescription:     { missing: 'Unit description absent',                            partial: 'Summary needs further development' },
  syllabusOutcomes:    { missing: 'No syllabus outcomes listed',                        partial: 'Assessed outcomes not distinguished from addressed outcomes' },
  duration:            { missing: 'Duration not specified',                             partial: 'Duration label present but no timeframe given' },
  stageYear:           { missing: 'Stage/year not identified',                          partial: 'Stage/year not visible in header' },
  syllabusContent:     { missing: 'Better integration of syllabus content required',   partial: 'Syllabus content not consistently mapped through lessons' },
  teachingActivities:  { missing: 'Teaching and learning activities absent',            partial: 'Some lessons contain incomplete or placeholder activities' },
  learningIntentions:  { missing: 'No learning intentions or success criteria',        partial: 'Some LI too expansive; LI/SC inconsistent across lessons' },
  subjectRequirements: { missing: 'HITS and differentiation missing',                  partial: 'HITS inconsistent; differentiation not documented' },
  resources:           { missing: 'Resources not documented',                          partial: 'Resources missing from sections of program; hyperlinks required' },
};

function generateNote(result) {
  const issues = result.criteriaResults
    .filter(c => c.tier !== 'strong')
    .map(c => SHORT_NOTES[c.key]?.[c.tier])
    .filter(Boolean);
  if (issues.length === 0) return 'All criteria met.';
  return issues.join('; ') + '.';
}

// Cell icon — matches the Excel checked/unchecked/partial style
function CellIcon({ tier }) {
  if (tier === 'strong') return (
    <span className="cell-icon cell-icon--strong" title="Met">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="16" height="16" rx="3" fill="rgba(16,185,129,0.15)" stroke="#10b981" strokeWidth="1.5"/>
        <path d="M5 9l2.8 2.8L13 6.5" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
  if (tier === 'partial') return (
    <span className="cell-icon cell-icon--partial" title="Present — refinements needed">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="16" height="16" rx="3" fill="rgba(232,184,75,0.12)" stroke="#e8b84b" strokeWidth="1.5"/>
        <path d="M9 5.5v4.5" stroke="#e8b84b" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="9" cy="12.5" r="1" fill="#e8b84b"/>
      </svg>
    </span>
  );
  return (
    <span className="cell-icon cell-icon--missing" title="Not met">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="16" height="16" rx="3" fill="rgba(239,68,68,0.12)" stroke="#ef4444" strokeWidth="1.5"/>
      </svg>
    </span>
  );
}

export default function SummaryPanel({ results, onClear }) {
  const total = results.length;
  const affirmed = results.filter(r => r.status === 'Affirmed').length;
  const devRequired = total - affirmed;
  const avgScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / total);

  return (
    <section className="sp-panel">

      {/* ── Compact stats bar ── */}
      <div className="sp-stats-bar">
        <div className="sp-stat-pill">
          <span className="sp-sp-num">{total}</span>
          <span className="sp-sp-lbl">Programs</span>
        </div>
        <div className="sp-stat-divider" />
        <div className="sp-stat-pill">
          <span className="sp-sp-num sp-sp-green">{affirmed}</span>
          <span className="sp-sp-lbl">Affirmed</span>
        </div>
        <div className="sp-stat-divider" />
        <div className="sp-stat-pill">
          <span className="sp-sp-num sp-sp-red">{devRequired}</span>
          <span className="sp-sp-lbl">Dev. Required</span>
        </div>
        <div className="sp-stat-divider" />
        <div className="sp-stat-pill">
          <span className="sp-sp-num sp-sp-gold">{avgScore}/10</span>
          <span className="sp-sp-lbl">Avg Score</span>
        </div>
        <div className="sp-stats-spacer" />
        <div className="sp-legend">
          <span className="sp-legend-item"><span className="sp-legend-dot sp-legend-dot--strong"/>Met</span>
          <span className="sp-legend-item"><span className="sp-legend-dot sp-legend-dot--partial"/>To Refine</span>
          <span className="sp-legend-item"><span className="sp-legend-dot sp-legend-dot--missing"/>Missing</span>
        </div>
        <button className="sp-export-btn" onClick={() => exportCSV(results)}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v7M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 10v1.5a.5.5 0 00.5.5h10a.5.5 0 00.5-.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          Export CSV
        </button>
        <button className="sp-clear-btn" onClick={onClear}>Clear All</button>
      </div>

      {/* ── Spreadsheet table ── */}
      <div className="sp-table-wrap">
        <table className="sp-table">
          <thead>
            <tr>
              <th className="sp-th sp-th-program">Program</th>
              {CRITERIA_HEADERS.map(h => (
                <th key={h} className="sp-th sp-th-criterion">
                  <div className="sp-th-rotated">{h}</div>
                </th>
              ))}
              <th className="sp-th sp-th-status">Compliance</th>
              <th className="sp-th sp-th-notes">Notes</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, idx) => {
              const isAffirmed = result.status === 'Affirmed';
              const displayName = result.fileName.replace(/\.(docx?)$/i, '');
              return (
                <tr key={idx} className={`sp-tr ${isAffirmed ? 'sp-tr--affirmed' : 'sp-tr--dev'}`}>
                  <td className="sp-td sp-td-program" title={displayName}>
                    <span className="sp-program-name">{displayName}</span>
                    <span className="sp-program-score">{result.score}/10</span>
                  </td>
                  {result.criteriaResults.map(c => (
                    <td key={c.key} className="sp-td sp-td-criterion">
                      <CellIcon tier={c.tier} />
                    </td>
                  ))}
                  <td className="sp-td sp-td-status">
                    <span className={`sp-status-badge ${isAffirmed ? 'sp-badge--affirmed' : 'sp-badge--dev'}`}>
                      {isAffirmed ? '✓ Affirmed' : '⚠ Dev. Required'}
                    </span>
                  </td>
                  <td className="sp-td sp-td-notes">
                    <span className="sp-notes-text">{generateNote(result)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
