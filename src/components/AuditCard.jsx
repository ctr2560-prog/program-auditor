import { useState } from 'react';
import './AuditCard.css';

const TierIcon = ({ tier }) => {
  if (tier === 'strong') return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7.25" fill="rgba(16,185,129,0.12)" stroke="#10b981" strokeWidth="1.5"/>
      <path d="M5 8l2.2 2.2L11 6" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (tier === 'partial') return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7.25" fill="rgba(232,184,75,0.12)" stroke="#e8b84b" strokeWidth="1.5"/>
      <path d="M8 5v4" stroke="#e8b84b" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="8" cy="11" r="0.9" fill="#e8b84b"/>
    </svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7.25" fill="rgba(239,68,68,0.1)" stroke="#ef4444" strokeWidth="1.5"/>
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
};

function FeedbackSection({ icon, title, countBadge, badgeClass, items, defaultOpen, iconClass }) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;
  return (
    <div className="card-section">
      <button className="section-toggle" onClick={() => setOpen(p => !p)} aria-expanded={open}>
        <span className="section-toggle-left">
          <span className={`section-icon ${iconClass}`}>{icon}</span>
          <span className="section-title">{title}</span>
          <span className={`section-count ${badgeClass}`}>{countBadge}</span>
        </span>
        <span className={`chevron ${open ? 'open' : ''}`}>›</span>
      </button>
      {open && (
        <ul className="feedback-list">
          {items.map((item, i) => (
            <li key={i} className={`feedback-item tier-${item.tier ?? 'missing'}`}>
              <TierIcon tier={item.tier ?? 'missing'} />
              <div className="feedback-item-body">
                <span className="feedback-label">{item.label}</span>
                <span className="feedback-text">{item.feedback}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AuditCard({ result, index, onRemove }) {
  const [showChecklist, setShowChecklist] = useState(false);

  const { fileName, criteriaResults, score, total, status, strengths, refinements, growth, wordCount, missingCount, partialCount, strongCount } = result;
  const pct = Math.round((score / total) * 100);
  const isAffirmed = status === 'Affirmed';

  const displayName = fileName.replace(/\.(docx?|DOCX?)$/, '');

  const ringColor = isAffirmed ? '#10b981' : pct >= 60 ? '#e8b84b' : '#ef4444';

  return (
    <article className="audit-card" style={{ animationDelay: `${index * 0.08}s` }}>
      <div className="card-header">
        <div className="card-file-info">
          <div className="card-file-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#e8b84b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#e8b84b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h3 className="card-filename" title={displayName}>{displayName}</h3>
            <span className="card-wordcount">{wordCount.toLocaleString()} words extracted</span>
          </div>
        </div>
        <button className="card-remove" onClick={onRemove} title="Remove">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="card-score-row">
        <div className="score-ring-wrap">
          <svg className="score-ring" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(13,27,110,0.08)" strokeWidth="8"/>
            <circle
              cx="40" cy="40" r="34" fill="none"
              stroke={ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct / 100)}`}
              transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <span className="score-ring-text">
            <span className="score-num">{score}</span>
            <span className="score-den">/{total}</span>
          </span>
        </div>

        <div className="score-details">
          <span className={`status-badge ${isAffirmed ? 'affirmed' : 'dev-required'}`}>
            {isAffirmed ? '✓ Affirmed' : '⚠ Development Required'}
          </span>

          <div className="tier-pill-row">
            {strongCount > 0 && (
              <span className="tier-pill strong">{strongCount} strong</span>
            )}
            {partialCount > 0 && (
              <span className="tier-pill partial">{partialCount} to refine</span>
            )}
            {missingCount > 0 && (
              <span className="tier-pill missing">{missingCount} missing</span>
            )}
          </div>

          <div className="score-bar-track">
            <div className="score-bar-fill strong-fill" style={{ width: `${(strongCount / total) * 100}%` }} />
            <div className="score-bar-fill partial-fill" style={{ width: `${(partialCount / total) * 100}%` }} />
          </div>
        </div>
      </div>

      <FeedbackSection
        icon="↑"
        iconClass="growth-icon"
        title="Missing — Action Required"
        countBadge={growth.length}
        badgeClass="missing"
        items={growth}
        defaultOpen={true}
      />

      <FeedbackSection
        icon="◑"
        iconClass="partial-icon"
        title="Present — Refinements to Consider"
        countBadge={refinements.length}
        badgeClass="partial"
        items={refinements}
        defaultOpen={refinements.length > 0 && growth.length === 0}
      />

      <FeedbackSection
        icon="★"
        iconClass="strength-icon"
        title="Areas of Strength"
        countBadge={strengths.length}
        badgeClass="strength"
        items={strengths}
        defaultOpen={false}
      />

      <div className="card-section">
        <button className="section-toggle" onClick={() => setShowChecklist(p => !p)} aria-expanded={showChecklist}>
          <span className="section-toggle-left">
            <span className="section-icon">☑</span>
            <span className="section-title">Full Compliance Checklist</span>
          </span>
          <span className={`chevron ${showChecklist ? 'open' : ''}`}>›</span>
        </button>
        {showChecklist && (
          <div className="checklist-grid">
            {criteriaResults.map((c) => (
              <div key={c.key} className={`checklist-item tier-${c.tier}`}>
                <TierIcon tier={c.tier} />
                <span className="checklist-label">{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
