import mammoth from 'mammoth';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns all unique NSW syllabus outcome codes found in text.
 * Handles multiple formats across curriculum versions:
 *   New:  EN4-ECA-01  MA5-LR-01  PDPHE4-1WB
 *   Old:  EN4-1A  MA4-7NA  PD4-1  DRA4-2
 *   Short: HIS5-1  GEO4-2
 */
function extractOutcomeCodes(text) {
  const patterns = [
    /\b[A-Z]{2,7}[45]-[A-Z]+-\d{1,3}\b/g,   // EN4-ECA-01 (new)
    /\b[A-Z]{2,7}[45]-\d+[A-Z]{1,4}\b/g,     // EN4-1A, MA4-7NA (old letter suffix)
    /\b[A-Z]{2,7}[45][-\.]\d+(?:\.\d+)?\b/g, // DRA4-2, Drama4.1.1 (short / dot format)
  ];
  const found = new Set();
  for (const pat of patterns) {
    for (const m of text.matchAll(pat)) found.add(m[0]);
  }
  return [...found];
}

function getOutcomesCount(text) {
  return extractOutcomeCodes(text).length;
}

/**
 * Concentration score: what fraction of outcome codes appear in the
 * first quarter of the document? High = listed in header only, not integrated.
 */
function outcomeConcentrationScore(text) {
  const allCodes = [...text.matchAll(/\b[A-Z]{2,7}[45][-\.]\S+/g)];
  if (allCodes.length === 0) return 0;
  const early = allCodes.filter(m => m.index < text.length * 0.25).length;
  return early / allCodes.length;
}

/**
 * Finds a duration that is plausible for an entire unit:
 *   >= 3 weeks  |  >= 8 hours  |  >= 8 lessons/sessions/periods
 * Returns the regex Match object, or null.
 */
function findUnitDurationMatch(text) {
  const all = [...text.matchAll(/(\d+\.?\d*)\s*(weeks?|hours?|lessons?|sessions?|periods?)/gi)];
  return all.find(m => {
    const n = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    if (/^week/.test(u)) return n >= 3;
    if (/^hour/.test(u)) return n >= 8;
    return n >= 8; // lessons / sessions / periods
  }) ?? null;
}

/**
 * Returns true if ANY plausible duration value can be found — used when
 * a Duration label is already confirmed (so no strict threshold needed).
 * Covers: "10 weeks", "20 lessons", "Term 3", "Semester 1", "1 term"
 */
function anyDurationValue(text) {
  return (
    /\d+\.?\d*\s*(weeks?|hours?|lessons?|sessions?|periods?|terms?|semesters?)/i.test(text) ||
    /\b(term|semester)\s*[1-4]\b/i.test(text)
  );
}

/**
 * Returns true if the Duration label appears to have a value filled in.
 * Checks 500 chars after each label occurrence, then falls back to first
 * half of the document (handles wide-table mammoth extraction).
 */
function durationLabelHasValue(text) {
  const re = /\bduration\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const window = text.slice(m.index, m.index + 500);
    if (anyDurationValue(window)) return true;
  }
  // Fallback: value anywhere in first half of doc (label and value may be in
  // separate table columns rendered far apart by mammoth).
  return anyDurationValue(text.slice(0, Math.floor(text.length * 0.5)));
}

function hasBlankPlaceholders(text) {
  return /\[\s*(what are we learning|to be completed|tbc|insert|placeholder|\.{3})\s*\??]/i.test(text)
    || /\[\s*\]/.test(text);
}

function countHITSStrategies(text) {
  const strategies = [
    /\b(think[- ]pair[- ]share|TPS)\b/i,
    /\bcollaborative learning\b/i,
    /\bexplicit teach/i,
    /\bworked examples?\b/i,
    /\bmetacogniti/i,
    /\bmultiple exposure/i,
    /\bgoal.?setting\b/i,
    /\bstructured overview\b/i,
    /\bnote.?taking\b/i,
    /\bformative (assessment|feedback)\b/i,
    /\bjigsaw\b/i,
    /\bpeer (tutoring|learning)\b/i,
    /\bspaced practice\b/i,
    /\bfeedback\b/i,
  ];
  return strategies.filter(p => p.test(text)).length;
}

function countHyperlinkResources(text) {
  return (text.match(/https?:\/\/\S+/g) || []).length;
}

function resourcesSpreadThroughDoc(text) {
  const resourceTerms = /\b(worksheet|booklet|presentation|slide[s]?|clip|video|onenote|canva|google|teams|sharepoint)\b/gi;
  const allMatches = [...text.matchAll(resourceTerms)];
  if (allMatches.length < 3) return false;
  const maxPos = Math.max(...allMatches.map(m => m.index));
  return maxPos > text.length * 0.5;
}

function getLICount(text) {
  return (text.match(/learning intention/gi) || []).length;
}

// ── Criteria ───────────────────────────────────────────────────────────────
// Each detect/qualify receives { text, fileName } so filename can supplement
// text-based detection (helpful when mammoth table extraction reorders content).

export const CRITERIA_META = [

  // ── 1. Calendar Year ──────────────────────────────────────────────────────
  {
    key: 'calendarYear',
    label: 'Calendar Year',
    detect: ({ text, fileName }) => {
      const combined = `${fileName}\n${text}`;
      return /202[0-9]/i.test(combined) || /calendar year/i.test(combined);
    },
    qualify: ({ text, fileName }) => {
      // Check header area AND filename (programs are often named with the year)
      const headerZone = `${fileName}\n${text.slice(0, 800)}`;
      if (!/202[0-9]/i.test(headerZone)) {
        return {
          tier: 'partial',
          feedback: 'A year appears somewhere in the document but isn\'t clearly visible in the unit header. Ensure the calendar year is stated at the top so programs can be readily identified and are version-controlled year to year.',
        };
      }
      return {
        tier: 'strong',
        feedback: 'Calendar year is clearly stated — easy to verify during an audit.',
      };
    },
    missingFeedback: 'The current calendar year is not present. Add it to the unit header. This is essential for version control — programs must be clearly dated so teachers, faculties and executive can confirm they\'re working from the current document.',
  },

  // ── 2. Unit Description / Summary ─────────────────────────────────────────
  {
    key: 'unitDescription',
    label: 'Unit Description / Summary',
    detect: ({ text }) =>
      /\bsummary\b/i.test(text) ||
      /unit (description|overview|summary|outline|focus)/i.test(text) ||
      /about this unit/i.test(text) ||
      /program overview/i.test(text),
    qualify: ({ text }) => {
      const summaryMatch = text.match(
        /(?:summary|unit description|unit overview|about this unit|program overview)[\s\S]{0,30}\n+([\s\S]{40,800}?)(?:\n{2,}|\nDuration|\nOutcome|\nSyllabus|\nAssess)/i
      );
      const descText = summaryMatch?.[1] ?? '';
      const wordCount = descText.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < 40) {
        return {
          tier: 'partial',
          feedback: 'A unit summary is present but it\'s quite brief. A strong summary should articulate the key text or content focus, the major learning sequence, and how the unit connects to prior and future learning — giving any reader an immediate sense of what this unit is trying to achieve.',
        };
      }
      return {
        tier: 'strong',
        feedback: 'The unit summary clearly articulates the content focus, key texts and learning sequence — any teacher or parent reading this immediately understands the purpose of the unit.',
      };
    },
    missingFeedback: 'No unit description or summary is present. Every program needs a clear overview that explains what the unit is about, what major texts or concepts students will engage with, and what they\'ll produce. This is often the first thing read in an audit.',
  },

  // ── 3. Syllabus Outcomes ──────────────────────────────────────────────────
  {
    key: 'syllabusOutcomes',
    label: 'Syllabus Outcomes',
    detect: ({ text }) => {
      // Section headings: "Outcomes", "Assessed Outcomes", "Syllabus Outcomes"
      const hasHeading = /\boutcomes?\b[:\s]/i.test(text) || /syllabus outcomes?/i.test(text) || /assessed outcomes?/i.test(text);
      // Any NSW-style outcome codes in the document
      const hasCodes = getOutcomesCount(text) > 0;
      return hasHeading || hasCodes;
    },
    qualify: ({ text }) => {
      const outcomeCount = getOutcomesCount(text);

      // Look for explicit "Assessed Outcomes" OR "Addressed Outcomes" section
      const hasAssessedSection =
        /assessed outcomes?/i.test(text) ||
        /addressed outcomes?/i.test(text) ||
        /outcomes?[\s\S]{0,80}assessed/i.test(text);

      // Check for outcome codes not just in the header but also within lesson rows
      const concentration = outcomeConcentrationScore(text);

      if (outcomeCount === 0 && /outcomes?[:\s]/i.test(text)) {
        // Heading present but no codes detected — partial, not strong
        return {
          tier: 'partial',
          feedback: 'An "Outcomes" heading is present but no syllabus outcome codes could be detected. Ensure the NESA outcome codes (e.g. EN4-ECA-01 or EN4-1A) are explicitly listed — not just outcome statements — so alignment to the NSW syllabus can be verified at a glance.',
        };
      }

      if (outcomeCount === 0) {
        return { tier: 'missing', feedback: 'No syllabus outcome codes detected.' };
      }

      if (hasAssessedSection) {
        return {
          tier: 'strong',
          feedback: `Syllabus outcomes are listed (${outcomeCount} outcome codes found) and assessed outcomes are clearly identified — excellent practice that supports moderation and reporting conversations.`,
        };
      }

      return {
        tier: 'partial',
        feedback: `Syllabus outcomes are listed (${outcomeCount} outcome codes found), but the program would benefit from distinguishing which outcomes are assessed in this unit versus those that are addressed. Labelling an "Assessed Outcomes" and "Addressed Outcomes" section makes this clear for moderation and reporting.`,
      };
    },
    missingFeedback: 'No syllabus outcomes are present. Every program must map explicitly to NSW syllabus outcomes. Without this, it\'s impossible to demonstrate curricular alignment or justify the content being taught.',
  },

  // ── 4. Duration ───────────────────────────────────────────────────────────
  {
    key: 'duration',
    label: 'Duration',
    detect: ({ text }) =>
      /\bduration\b/i.test(text) ||
      /length of (unit|program)/i.test(text) ||
      findUnitDurationMatch(text) !== null,
    qualify: ({ text }) => {
      const hasDurationLabel =
        /\bduration\b/i.test(text) || /length of (unit|program)/i.test(text);
      const unitDuration = findUnitDurationMatch(text);

      if (hasDurationLabel) {
        if (durationLabelHasValue(text)) {
          const valueStr = unitDuration
            ? `${unitDuration[1]} ${unitDuration[2].toLowerCase()}`
            : 'a duration value';
          return {
            tier: 'strong',
            feedback: `Duration is clearly stated (${valueStr}) — this makes scope and sequence verification straightforward.`,
          };
        }
        return {
          tier: 'missing',
          feedback: 'A "Duration" field is present but no timeframe value could be found — the field appears to be blank. An empty duration label is not compliant. Fill in the number of weeks, hours or lessons for this unit.',
        };
      }

      if (unitDuration) {
        return {
          tier: 'partial',
          feedback: `A timeframe of ${unitDuration[1]} ${unitDuration[2].toLowerCase()} is mentioned but there is no explicit "Duration" field or label. Adding a clearly labelled duration in the unit header ensures it\'s immediately identifiable during an audit.`,
        };
      }

      return {
        tier: 'partial',
        feedback: 'Duration field is present but could not be confirmed as complete. Ensure the actual number of weeks, hours or lessons is filled in beside the Duration heading.',
      };
    },
    missingFeedback: 'No unit duration is specified. Include the number of weeks and/or lessons to confirm the program covers an appropriate timeframe. This is also essential for scope and sequence alignment across the faculty.',
  },

  // ── 5. Stage / Year Group ─────────────────────────────────────────────────
  {
    key: 'stageYear',
    label: 'Stage / Year Group',
    detect: ({ text, fileName }) => {
      const combined = `${fileName}\n${text}`;
      return (
        /year\s*[7-9](?!\d)/i.test(combined) ||
        /year\s*10(?!\d)/i.test(combined) ||
        /stage\s*[3-5]/i.test(combined) ||
        /yr\.?\s*[7-9](?!\d)/i.test(combined) ||
        // "8 English", "7 Drama" in filename or opening lines
        /\b[7-9]\s+(english|maths|mathematics|science|drama|history|pdhpe|pe|visual arts|music|geography|commerce|french|japanese|chinese|korean|arabic)\b/i.test(combined)
      );
    },
    qualify: ({ text, fileName }) => {
      // Filename is the most reliable indicator (e.g. "2026 Year 7 Unit 2 Drama...")
      const inFileName = /year\s*[7-9]|year\s*10|stage\s*[3-5]|yr\.?\s*[7-9]|\b[7-9]\s+(english|maths|drama|science|history|geography)/i.test(fileName);

      // Also check a generous header slice — mammoth table extraction can push
      // the header row values past position 400, so use first 1200 chars.
      const headerZone = text.slice(0, 1200);
      const inHeader = /year\s*[7-9]|year\s*10|stage\s*[3-5]|yr\.?\s*[7-9]/i.test(headerZone);

      if (inFileName || inHeader) {
        return {
          tier: 'strong',
          feedback: 'Year group and stage are clearly identified — easy to confirm during an audit.',
        };
      }
      // Found in the body of the document but not in the header area
      return {
        tier: 'partial',
        feedback: 'A year group or stage is referenced in the document but doesn\'t appear prominently in the header area. It should be immediately visible at the top of the program for quick identification during audits.',
      };
    },
    missingFeedback: 'No stage or year group is identified. This must be stated in the unit header — it contextualises all other elements of the program and is a basic compliance requirement.',
  },

  // ── 6. Syllabus Content Integration ──────────────────────────────────────
  {
    key: 'syllabusContent',
    label: 'Syllabus Content Integration',
    detect: ({ text }) =>
      /syllabus content/i.test(text) ||
      /content (point|descriptor|area)/i.test(text) ||
      getOutcomesCount(text) > 0,
    qualify: ({ text }) => {
      const concentration = outcomeConcentrationScore(text);
      const hasSyllabusContentSection = /syllabus content/i.test(text);

      if (concentration > 0.75) {
        return {
          tier: 'missing',
          feedback: 'Syllabus outcome codes appear predominantly in the outcomes header but are not referenced within individual lesson activities. Listing outcomes at the top is a start, not a finish — a compliant program explicitly connects each lesson or learning sequence to the relevant content descriptor. This is what allows anyone to audit alignment between teaching and the syllabus at the lesson level, not just at the unit level.',
        };
      }
      if (hasSyllabusContentSection) {
        return {
          tier: 'strong',
          feedback: 'Syllabus content is mapped throughout the lesson sequence — this demonstrates genuine alignment between teaching activities and the NSW syllabus, not just a surface-level listing.',
        };
      }
      return {
        tier: 'partial',
        feedback: 'Outcome codes appear within lessons, but a dedicated "Syllabus Content" column or section would strengthen auditability. Explicit mapping makes it far easier to verify alignment during quality review conversations.',
      };
    },
    missingFeedback: 'No syllabus content descriptors or outcome codes are referenced in this program. Every lesson must map to the NSW syllabus. Without this, it\'s not possible to confirm the program delivers the required curriculum — this is a significant compliance gap.',
  },

  // ── 7. Teaching & Learning Activities ────────────────────────────────────
  {
    key: 'teachingActivities',
    label: 'Teaching & Learning Activities',
    detect: ({ text }) =>
      /teaching (and|&) learning/i.test(text) ||
      /activit(y|ies)/i.test(text) ||
      /lesson\s*[0-9]/i.test(text) ||
      /week\s*[0-9]/i.test(text) ||
      /session\s*[0-9]/i.test(text) ||
      /learning (sequence|program)/i.test(text),
    qualify: ({ text }) => {
      const activityCount = (text.match(/\b(activity|task|lesson|session)\b/gi) || []).length;
      if (hasBlankPlaceholders(text)) {
        return {
          tier: 'partial',
          feedback: 'Teaching and learning activities are detailed in most lessons, but some rows contain placeholder text that hasn\'t been completed. A program submitted for audit should be complete — every lesson needs documented activities, even if the teacher plans to refine delivery on the day.',
        };
      }
      if (activityCount < 10) {
        return {
          tier: 'partial',
          feedback: 'Some teaching and learning activities are present but the level of detail is thin. Programs should provide enough specificity that another teacher could pick up and deliver the unit — broad descriptors aren\'t sufficient.',
        };
      }
      return {
        tier: 'strong',
        feedback: 'Teaching and learning activities are well-detailed throughout the program, giving a clear picture of the learning sequence.',
      };
    },
    missingFeedback: 'No teaching and learning activities are documented. This is the core of any program — a detailed week-by-week or lesson-by-lesson sequence of what students will do and what teachers will teach must be present.',
  },

  // ── 8. Learning Intentions & Success Criteria ─────────────────────────────
  {
    key: 'learningIntentions',
    label: 'Learning Intentions & Success Criteria',
    detect: ({ text }) =>
      /learning intention/i.test(text) ||
      /success criteria/i.test(text) ||
      /by the end of (this )?(lesson|unit|session)/i.test(text) ||
      /\bI can\b/i.test(text) ||
      /\bWALT\b/.test(text),
    qualify: ({ text }) => {
      const liCount = getLICount(text);
      const hasPlaceholders =
        hasBlankPlaceholders(text) ||
        /\[what are we learning\?\]/i.test(text);
      const hasICanFormat = /I can[.…\n]/i.test(text);

      const issues = [];

      if (hasPlaceholders) {
        issues.push('Some lessons contain blank or placeholder learning intentions that need to be completed.');
      }
      if (liCount < 3) {
        issues.push('Learning intentions appear infrequently — ideally every lesson or learning sequence should have its own LI so students always know what they\'re working towards.');
      }

      // Flag broad, aspirational LIs
      const liMatches = [...text.matchAll(/Learning Intention[s]?[:()\s]+([^\n]{20,})/gi)];
      const broadLIs = liMatches.filter(
        m => m[1].split(' ').length > 15 && /understand|explore|develop|gain/i.test(m[1])
      );
      if (broadLIs.length > 0) {
        issues.push('Some learning intentions are broad and aspirational ("To understand...", "To explore...") rather than specific and observable. Strong LIs describe what students will demonstrably know or do — try "Students will analyse..." or "Students will compose..." with a specific focus.');
      }

      if (issues.length === 0) {
        const formatNote = hasICanFormat
          ? ' The \'I can...\' success criteria format is used consistently — excellent practice for student-facing clarity.'
          : '';
        return {
          tier: 'strong',
          feedback: `Learning intentions and success criteria are present throughout the program.${formatNote}`,
        };
      }
      return { tier: 'partial', feedback: issues.join(' ') };
    },
    missingFeedback: 'No learning intentions or success criteria are present. Every lesson must have a clearly stated learning intention ("By the end of this lesson, students will...") and measurable success criteria. These drive student metacognition and give teachers a clear instructional focus.',
  },

  // ── 9. Subject-Specific Requirements (HITS, Differentiation) ─────────────
  {
    key: 'subjectRequirements',
    label: 'Subject-Specific Requirements (HITS, Differentiation)',
    detect: ({ text }) =>
      /\bHITS?\b/i.test(text) ||
      /high.?impact/i.test(text) ||
      /differentiat/i.test(text) ||
      /adjustment/i.test(text) ||
      /extension/i.test(text),
    qualify: ({ text }) => {
      const namedHITS = countHITSStrategies(text);
      const hitsAsColumnOnly =
        /syllabus content[\s\S]{0,80}HITS[\s\S]{0,80}teaching/i.test(text) && namedHITS < 3;
      const hasDifferentiation =
        /differentiat/i.test(text) ||
        /adjustment/i.test(text) ||
        /extension task/i.test(text) ||
        /EAL\/D/i.test(text) ||
        /additional needs/i.test(text);

      const issues = [];

      if (hitsAsColumnOnly) {
        issues.push('HITS appears as a column heading but specific strategies aren\'t consistently named within lessons. Labelling each strategy explicitly — even shorthand like "TPS" for Think-Pair-Share, "EI" for Explicit Instruction — makes instructional choices transparent and supports observation debrief conversations.');
      } else if (namedHITS < 5) {
        issues.push(`${namedHITS} HITS strateg${namedHITS === 1 ? 'y' : 'ies'} identifiable. Aim to name at least one HITS per lesson group — this doesn\'t require elaborate documentation, just clarity about which high-impact strategy is being used.`);
      }

      if (!hasDifferentiation) {
        issues.push('No differentiation or adjustments for diverse learners are documented. Every program must address how activities will be modified for students working above and below expected level, those with adjustments, and EAL/D learners.');
      }

      if (issues.length === 0) {
        return {
          tier: 'strong',
          feedback: 'HITS strategies are evident and named throughout the program, and differentiation is documented — this reflects strong pedagogical planning.',
        };
      }
      return { tier: 'partial', feedback: issues.join(' ') };
    },
    missingFeedback: 'No HITS strategies or differentiation provisions are documented. NSW DoE policy requires programs to identify High Impact Teaching Strategies and include adjustments for diverse learners. This is one of the most commonly cited gaps in program audits.',
  },

  // ── 10. Resources ─────────────────────────────────────────────────────────
  {
    key: 'resources',
    label: 'Resources',
    detect: ({ text }) =>
      /\bresource[s]?\b/i.test(text) ||
      /https?:\/\//i.test(text) ||
      /\b(onenote|textbook|worksheet|booklet|canva|sharepoint|google classroom)\b/i.test(text),
    qualify: ({ text }) => {
      const linkCount = countHyperlinkResources(text);
      const spreadThroughout = resourcesSpreadThroughDoc(text);

      // Parse Key Resources section carefully, stopping at the next section heading
      const krIndex = text.search(/key resources/i);
      const krSlice = krIndex >= 0 ? text.slice(krIndex, krIndex + 400) : '';
      const krBody = krSlice.replace(/key resources[:\s]*/i, '');
      const krBeforeNextSection = krBody.split(
        /\n{3,}|\n(?=Outcomes?|Syllabus|Assessment|Literacy|Numeracy|Appendix)/i
      )[0];
      const keyResourcesItems = krBeforeNextSection
        .split('\n')
        .filter(l => {
          const t = l.trim();
          return t.length > 8 && !/^key resources/i.test(t);
        }).length;

      if (keyResourcesItems <= 1 && linkCount <= 1) {
        return {
          tier: 'missing',
          feedback: `The Key Resources section lists only ${keyResourcesItems === 0 ? 'no items' : '1 item'} and the program contains almost no hyperlinks. Resources referenced within lessons need to be accessible — that means hyperlinked — and the Key Resources section must list all major materials (core texts, digital tools, booklets, OneNote or SharePoint links). A program that mentions a resource without linking to it is not a usable planning document.`,
        };
      }

      const issues = [];
      if (linkCount < 3) {
        issues.push(`Only ${linkCount} hyperlink${linkCount !== 1 ? 's' : ''} found. Resources should be hyperlinked throughout — presentations, worksheets, videos and digital tools all need accessible links so the program works as a standalone document for any teacher covering or inheriting the class.`);
      }
      if (keyResourcesItems <= 2) {
        issues.push('The Key Resources overview is sparse. It should list all major materials upfront so teachers can confirm access before the unit begins — not discover missing resources mid-lesson.');
      }
      if (!spreadThroughout) {
        issues.push('Resources drop off in the back half of the program. Ensure every lesson has its resources documented.');
      }

      if (issues.length === 0) {
        return {
          tier: 'strong',
          feedback: `Resources are well-documented throughout the program with ${linkCount} hyperlinks and a substantive Key Resources section — any teacher can pick this up and deliver the unit.`,
        };
      }
      return { tier: 'partial', feedback: issues.join(' ') };
    },
    missingFeedback: 'No resources are documented. Every unit must list all materials, texts, digital tools and links needed to deliver it. Without resources, the program cannot function as a planning document and is not auditable.',
  },
];

// ── Main analysis function ─────────────────────────────────────────────────

export async function analyzeDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value;

  // Context passed to every criterion so filename can supplement text detection
  const ctx = { text, fileName: file.name };

  const criteriaResults = CRITERIA_META.map(criterion => {
    const detected = criterion.detect(ctx);
    if (!detected) {
      return {
        key: criterion.key,
        label: criterion.label,
        tier: 'missing',
        met: false,
        feedback: criterion.missingFeedback,
      };
    }
    const { tier, feedback } = criterion.qualify(ctx);
    return {
      key: criterion.key,
      label: criterion.label,
      tier,
      met: tier !== 'missing',
      feedback,
    };
  });

  const metCount = criteriaResults.filter(c => c.met).length;
  const missingCount = criteriaResults.filter(c => c.tier === 'missing').length;
  const partialCount = criteriaResults.filter(c => c.tier === 'partial').length;
  const strongCount = criteriaResults.filter(c => c.tier === 'strong').length;

  const status = missingCount === 0 ? 'Affirmed' : 'Development Required';

  const strengths  = criteriaResults.filter(c => c.tier === 'strong');
  const refinements = criteriaResults.filter(c => c.tier === 'partial');
  const growth     = criteriaResults.filter(c => c.tier === 'missing');

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    fileName: file.name,
    text,
    wordCount,
    criteriaResults,
    score: metCount,
    total: CRITERIA_META.length,
    missingCount,
    partialCount,
    strongCount,
    status,
    strengths,
    refinements,
    growth,
  };
}
