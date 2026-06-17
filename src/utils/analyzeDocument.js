import mammoth from 'mammoth';

// ── Quality check helpers ──────────────────────────────────────────────────

function countMatches(text, patterns) {
  return patterns.reduce((n, p) => n + (text.match(new RegExp(p.source, p.flags + (p.flags.includes('g') ? '' : 'g')))?.length ?? 0), 0);
}

function outcomeConcentrationScore(text) {
  const codes = [...text.matchAll(/[A-Z]{2,5}[45]-[A-Z]+-\d{2}/g)];
  if (codes.length === 0) return 0;
  const early = codes.filter(m => m.index < text.length * 0.25).length;
  return early / codes.length;
}

function hasBlankPlaceholders(text) {
  return /\[\s*(what are we learning|to be completed|tbc|insert|placeholder|\.{3})\s*\??]/i.test(text)
    || /\[\s*\]/g.test(text);
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

function getAssessmentDatePresent(text) {
  // Task notification with a real date
  const match = text.match(/due date[:\s]+([^\n]{3,30})/i);
  if (!match) return false;
  const val = match[1].trim();
  return val.length > 2 && !/^\s*$/.test(val) && !/^(tbc|na|n\/a|--)$/i.test(val);
}

function getLICount(text) {
  return (text.match(/learning intention/gi) || []).length;
}

function getOutcomesCount(text) {
  return (text.match(/[A-Z]{2,5}[45]-[A-Z]+-\d{2}/g) || []).length;
}

// ── Criteria definition ─────────────────────────────────────────────────────
// tier: 'strong' | 'partial' | 'missing'
// Each criterion returns { key, label, tier, feedback }

export const CRITERIA_META = [
  {
    key: 'calendarYear',
    label: 'Calendar Year',
    detect: (text) => /202[0-9]/i.test(text) || /calendar year/i.test(text) || /term [1-4][,\s]+202/i.test(text),
    qualify: (text) => {
      const header = text.slice(0, 600);
      if (!/202[0-9]/i.test(header)) {
        return { tier: 'partial', feedback: 'A year appears in the document but isn\'t prominent in the unit header. Ensure the calendar year is visible at the top so programs can be readily identified during audits and are clearly version-controlled year to year.' };
      }
      return { tier: 'strong', feedback: 'Calendar year is clearly stated in the unit header — easy to verify at a glance.' };
    },
    missingFeedback: 'The current calendar year is not present. Add it to the unit header. This is essential for version control — programs must be clearly dated so teachers, faculties and executive can confirm they\'re working from the current document.',
  },

  {
    key: 'unitDescription',
    label: 'Unit Description / Summary',
    detect: (text) => /\bsummary\b/i.test(text) || /unit (description|overview|summary|outline|focus)/i.test(text) || /about this unit/i.test(text),
    qualify: (text) => {
      const summaryMatch = text.match(/summary[\s\S]{0,20}\n+([\s\S]{50,600}?)(?:\n\n|\nDuration|\nOutcomes)/i);
      const descText = summaryMatch?.[1] ?? '';
      const wordCount = descText.split(/\s+/).filter(Boolean).length;
      if (wordCount < 40) {
        return { tier: 'partial', feedback: 'A unit summary is present but it\'s quite brief. A strong summary should articulate the key text or content focus, the major learning sequence, and how the unit connects to prior and future learning — giving any reader an immediate sense of what this unit is trying to achieve.' };
      }
      return { tier: 'strong', feedback: 'The unit summary clearly articulates the content focus, key texts and the learning sequence — any teacher or parent reading this immediately understands the purpose of the unit.' };
    },
    missingFeedback: 'No unit description or summary is present. Every program needs a clear overview that explains what the unit is about, what major texts or concepts students will engage with, and what they\'ll produce. This is often the first thing read in an audit.',
  },

  {
    key: 'syllabusOutcomes',
    label: 'Syllabus Outcomes',
    detect: (text) => /outcome[s]?[:\s]/i.test(text) || /[A-Z]{2,5}[45]-[A-Z]+-\d{2}/.test(text) || /syllabus outcome/i.test(text),
    qualify: (text) => {
      const outcomeCount = getOutcomesCount(text);
      const hasAssessed = /assessed outcome/i.test(text);
      if (outcomeCount === 0) {
        return { tier: 'missing', feedback: 'No syllabus outcome codes detected.' };
      }
      if (!hasAssessed) {
        return { tier: 'partial', feedback: `Syllabus outcomes are listed (${outcomeCount} outcome codes found), but the program would benefit from identifying which outcomes are specifically assessed in this unit versus those that are addressed. This distinction matters for moderation and reporting.` };
      }
      return { tier: 'strong', feedback: `Syllabus outcomes are clearly listed with ${outcomeCount} outcome codes, and assessed outcomes are identified — excellent practice that supports moderation and reporting conversations.` };
    },
    missingFeedback: 'No syllabus outcome codes are present. Every program must map explicitly to NSW syllabus outcomes. Without this, it\'s impossible to demonstrate curricular alignment or justify the content being taught.',
  },

  {
    key: 'duration',
    label: 'Duration',
    detect: (text) => /\d+\s*(weeks?|hours?|lessons?|sessions?|periods?)/i.test(text) || /duration/i.test(text) || /length of (unit|program)/i.test(text),
    qualify: (text) => {
      // Find any number+unit combination — note: table-based DOCX programs
      // may extract the label and value at different positions, so no position check
      const durationMatch = text.match(/(\d+\.?\d*)\s*(weeks?|hours?|lessons?|sessions?|periods?)/i);
      const hasDurationLabel = /\bduration\b/i.test(text);

      if (!durationMatch) {
        // "Duration" label present but no number found
        return { tier: 'partial', feedback: 'A "Duration" heading is present but no specific timeframe (number of weeks, hours or lessons) could be identified. Ensure the actual duration value is filled in — an empty duration label is not compliant.' };
      }

      const num = parseFloat(durationMatch[1]);
      const unit = durationMatch[2].toLowerCase();

      if (hasDurationLabel) {
        return { tier: 'strong', feedback: `Duration is clearly stated (${num} ${unit}) in the program — this makes scope and sequence verification straightforward.` };
      }
      // Number present but no "Duration" label
      return { tier: 'partial', feedback: `A timeframe of ${num} ${unit} is mentioned but there's no explicit "Duration" heading. Labelling it clearly ensures it's immediately identifiable during an audit.` };
    },
    missingFeedback: 'No unit duration is specified. Include the number of weeks and/or lessons to confirm the program covers an appropriate timeframe. This is also essential for scope and sequence alignment across the faculty.',
  },

  {
    key: 'stageYear',
    label: 'Stage / Year Group',
    detect: (text) => /stage [3-5]/i.test(text) || /year\s*[7-9](?!\d)/i.test(text) || /year\s*10/i.test(text) || /YEAR\s*[7-9]/i.test(text) || /yr\s*[7-9](?!\d)/i.test(text),
    qualify: (text) => {
      const header = text.slice(0, 400);
      const inHeader = /year\s*[7-9]|year\s*10|stage [3-5]|YEAR [7-9]/i.test(header);
      if (!inHeader) {
        return { tier: 'partial', feedback: 'The year group or stage is mentioned in the document but doesn\'t appear prominently in the header. It should be immediately visible for quick identification in audits.' };
      }
      return { tier: 'strong', feedback: 'Year group and stage are clearly identified in the program header.' };
    },
    missingFeedback: 'No stage or year group is identified. This must be stated in the unit header — it contextualises all other elements of the program and is a basic compliance requirement.',
  },

  {
    key: 'syllabusContent',
    label: 'Syllabus Content Integration',
    detect: (text) => /syllabus content/i.test(text) || /content (point|descriptor|area)/i.test(text) || getOutcomesCount(text) > 0,
    qualify: (text) => {
      const concentration = outcomeConcentrationScore(text);
      const hasSyllabusContentSection = /syllabus content/i.test(text);

      // If >75% of outcome codes are in the first quarter, they're listed, not integrated
      if (concentration > 0.75) {
        return { tier: 'missing', feedback: 'Syllabus outcome codes appear predominantly in the outcomes header but are not mapped within individual lesson activities. Listing outcomes at the top is a start, not a finish — a compliant program explicitly connects each lesson or learning sequence to the relevant content descriptor. This is what allows anyone to audit alignment between teaching and the syllabus at the lesson level, not just at the unit level.' };
      }
      if (hasSyllabusContentSection && concentration <= 0.75) {
        return { tier: 'strong', feedback: 'Syllabus content is mapped throughout the lesson sequence — this demonstrates genuine alignment between teaching activities and the NSW syllabus, not just a surface-level listing.' };
      }
      return { tier: 'partial', feedback: 'Outcome codes appear within lessons, but a dedicated "Syllabus Content" column or section would strengthen the program\'s auditability. Explicit mapping makes it far easier to verify alignment during quality review conversations.' };
    },
    missingFeedback: 'No syllabus content descriptors or outcome codes are referenced anywhere in this program. Every lesson must map to the NSW syllabus. Without this, it\'s not possible to confirm the program delivers the required curriculum — this is a significant compliance gap that must be addressed before resubmission.',
  },

  {
    key: 'teachingActivities',
    label: 'Teaching & Learning Activities',
    detect: (text) => /teaching (and|&) learning/i.test(text) || /activit(y|ies)/i.test(text) || /lesson [0-9]/i.test(text) || /week [0-9]/i.test(text) || /session [0-9]/i.test(text) || /learning (sequence|program)/i.test(text),
    qualify: (text) => {
      const activityCount = (text.match(/\b(activity|task|lesson|session)\b/gi) || []).length;
      if (hasBlankPlaceholders(text)) {
        return { tier: 'partial', feedback: 'Teaching and learning activities are detailed in most lessons, but some rows contain placeholder text that hasn\'t been completed. A program submitted for audit should be complete — every lesson needs documented activities, even if the teacher plans to refine delivery on the day.' };
      }
      if (activityCount < 10) {
        return { tier: 'partial', feedback: 'Some teaching and learning activities are present but the level of detail is thin. Programs should provide enough specificity that another teacher could pick up and deliver the unit — broad descriptors aren\'t enough.' };
      }
      return { tier: 'strong', feedback: `Teaching and learning activities are well-detailed throughout the program, giving a clear picture of the learning sequence.` };
    },
    missingFeedback: 'No teaching and learning activities are documented. This is the core of any program — a detailed week-by-week or lesson-by-lesson sequence of what students will do and what teachers will teach must be present.',
  },

  {
    key: 'learningIntentions',
    label: 'Learning Intentions & Success Criteria',
    detect: (text) => /learning intention/i.test(text) || /success criteria/i.test(text) || /by the end of/i.test(text) || /\bI can\b/i.test(text),
    qualify: (text) => {
      const liCount = getLICount(text);
      const hasPlaceholders = hasBlankPlaceholders(text) || /\[what are we learning\?\]/i.test(text) || /\[.*?\]/g.test(text.replace(/\n/g, ' '));
      const hasICanFormat = /I can[.…\n]/i.test(text);

      const issues = [];
      if (hasPlaceholders) issues.push('Some lessons contain blank or placeholder learning intentions that need to be completed.');
      if (liCount < 3) issues.push('Learning intentions appear infrequently — ideally every lesson or learning sequence should have its own LI so students always know what they\'re working towards.');

      // Check for overly broad LIs
      const liMatches = [...text.matchAll(/Learning Intention[s]?[:()\s]+([^\n]{20,})/gi)];
      const broadLIs = liMatches.filter(m => m[1].split(' ').length > 15 && /understand|explore|develop|gain/i.test(m[1]));
      if (broadLIs.length > 0) issues.push('Some learning intentions are broad and aspirational ("To understand...", "To explore...") rather than specific and observable. Strong LIs describe what students will demonstrably know or do by the end of the lesson — try "Students will analyse..." or "Students will compose..." with a specific focus.');

      if (issues.length === 0) {
        const formatNote = hasICanFormat ? ' The \'I can...\' success criteria format is used consistently — this is excellent practice for student-facing clarity.' : '';
        return { tier: 'strong', feedback: `Learning intentions and success criteria are present throughout the program.${formatNote}` };
      }
      return { tier: 'partial', feedback: issues.join(' ') };
    },
    missingFeedback: 'No learning intentions or success criteria are present. Every lesson must have a clearly stated learning intention ("By the end of this lesson, students will...") and measurable success criteria. These are not optional — they drive student metacognition and give teachers a clear focus for instruction.',
  },

  {
    key: 'subjectRequirements',
    label: 'Subject-Specific Requirements (HITS, Differentiation)',
    detect: (text) => /\bHITS?\b/i.test(text) || /high.?impact/i.test(text) || /differentiat/i.test(text) || /adjustment/i.test(text) || /extension/i.test(text),
    qualify: (text) => {
      const namedHITS = countHITSStrategies(text);
      const hitsAsColumnOnly = /syllabus content[\s\S]{0,50}HITS[\s\S]{0,50}teaching/i.test(text) && namedHITS < 3;
      const hasDifferentiation = /differentiat/i.test(text) || /adjustment/i.test(text) || /extension/i.test(text);
      const issues = [];

      if (hitsAsColumnOnly) {
        issues.push('HITS appears as a column heading but specific strategies aren\'t consistently named within lessons. Labelling each strategy explicitly — even shorthand like "TPS" for Think-Pair-Share, "EI" for Explicit Instruction — makes instructional choices transparent, supports observation debrief conversations, and makes the program far more useful as a professional tool.');
      } else if (namedHITS < 5) {
        issues.push(`${namedHITS} HITS strategies are identifiable in the program. Aim to name at least one HITS per lesson group — this doesn\'t require elaborate documentation, just clarity about which high-impact strategy is being used and why.`);
      }

      if (!hasDifferentiation) {
        issues.push('No differentiation or adjustments for diverse learners are documented. Every program must address how activities will be modified for students working above and below expected level, students with adjustments, and EAL/D learners.');
      }

      if (issues.length === 0) {
        return { tier: 'strong', feedback: `HITS strategies are evident and named throughout the program, and differentiation is documented — this reflects strong pedagogical planning.` };
      }
      return { tier: 'partial', feedback: issues.join(' ') };
    },
    missingFeedback: 'No HITS strategies or differentiation provisions are documented. NSW DoE policy requires programs to identify High Impact Teaching Strategies (HITS) and include adjustments for diverse learners. This is one of the most commonly cited gaps in program audits and needs to be addressed before the next submission.',
  },

  {
    key: 'resources',
    label: 'Resources',
    detect: (text) => /\bresource[s]?\b/i.test(text) || /https?:\/\//i.test(text) || /\b(onenote|textbook|worksheet|booklet|canva|sharepoint|google classroom)\b/i.test(text),
    qualify: (text) => {
      const linkCount = countHyperlinkResources(text);
      const inlineResourceCount = (text.match(/\b(worksheet|booklet|presentation|slide[s]?|clip|video|onenote|canva|teams|google|sharepoint)\b/gi) || []).length;
      const spreadThroughout = resourcesSpreadThroughDoc(text);
      // Extract only the content immediately after the "Key resources" heading,
      // stopping at the next major section (triple newline or next heading keyword)
      const krIndex = text.search(/key resources/i);
      const krSlice = krIndex >= 0 ? text.slice(krIndex, krIndex + 300) : '';
      const krBody = krSlice.replace(/key resources[:\s]*/i, '');
      const krBeforeNextSection = krBody.split(/\n{3,}|\n(?=Outcomes|Syllabus|Assessment|Literacy|Numeracy)/i)[0];
      const keyResourcesItems = krBeforeNextSection.split('\n').filter(l => {
        const t = l.trim();
        return t.length > 8 && !/^key resources/i.test(t);
      }).length;

      // Not truly compliant: minimal key resources AND no meaningful hyperlinks
      if (keyResourcesItems <= 1 && linkCount <= 1) {
        return { tier: 'missing', feedback: `The Key Resources section lists only ${keyResourcesItems === 0 ? 'no items' : '1 item'} and the program contains almost no hyperlinks. Resources referenced within lessons need to be accessible — that means hyperlinked — and the Key Resources section must list all major materials (core texts, digital tools, booklets, OneNote or SharePoint links). A program that mentions a resource without linking to it is not a usable planning document for anyone other than the author.` };
      }

      const issues = [];
      if (linkCount < 3) {
        issues.push(`Only ${linkCount} hyperlink${linkCount !== 1 ? 's' : ''} found. Resources should be hyperlinked throughout — presentations, worksheets, videos and digital tools all need accessible links so the program works as a standalone document for any teacher covering or inheriting the class.`);
      }
      if (keyResourcesItems <= 2) {
        issues.push('The Key Resources overview is sparse. It should list all major materials upfront so teachers can confirm access before the unit begins — not discover missing resources mid-lesson.');
      }
      if (!spreadThroughout) {
        issues.push('Resources drop off in the back half of the program. Ensure every lesson has its resources documented — this is one of the most common gaps in program audits, and it creates real problems when staff cover classes or new teachers take over mid-unit.');
      }

      if (issues.length === 0) {
        return { tier: 'strong', feedback: `Resources are well-documented throughout the program with ${linkCount} hyperlinks and a substantive Key Resources section — any teacher can pick this up and deliver the unit.` };
      }
      return { tier: 'partial', feedback: issues.join(' ') };
    },
    missingFeedback: 'No resources are documented in this program. Every unit must list all materials, texts, digital tools and links needed to deliver it. Without resources, the program cannot function as a planning document and is not auditable.',
  },
];

// ── Main analysis function ──────────────────────────────────────────────────

export async function analyzeDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value;

  const criteriaResults = CRITERIA_META.map(criterion => {
    const detected = criterion.detect(text);
    if (!detected) {
      return {
        key: criterion.key,
        label: criterion.label,
        tier: 'missing',
        met: false,
        feedback: criterion.missingFeedback,
      };
    }
    const { tier, feedback } = criterion.qualify(text);
    return {
      key: criterion.key,
      label: criterion.label,
      tier: tier === 'missing' ? 'missing' : tier,
      met: tier !== 'missing',
      feedback,
    };
  });

  const metCount = criteriaResults.filter(c => c.met).length;
  const score = metCount;
  const total = CRITERIA_META.length;
  const missingCount = criteriaResults.filter(c => c.tier === 'missing').length;
  const partialCount = criteriaResults.filter(c => c.tier === 'partial').length;
  const strongCount = criteriaResults.filter(c => c.tier === 'strong').length;

  // Affirmed = all criteria met (strong or partial)
  const status = missingCount === 0 ? 'Affirmed' : 'Development Required';

  const strengths = criteriaResults.filter(c => c.tier === 'strong');
  const refinements = criteriaResults.filter(c => c.tier === 'partial');
  const growth = criteriaResults.filter(c => c.tier === 'missing');

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    fileName: file.name,
    text,
    wordCount,
    criteriaResults,
    score,
    total,
    missingCount,
    partialCount,
    strongCount,
    status,
    strengths,
    refinements,
    growth,
  };
}
