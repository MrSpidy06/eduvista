const SUPPORTED_ACADEMIC_LEVELS = new Set(["10", "12"]);
const SUPPORTED_DELIVERY_MODES = new Set(["offline", "online", "both"]);
const SCHOOL_LEVEL_BLOCKERS = [
  /relevant ug/i,
  /\bug degree\b/i,
  /\bgraduate\b/i,
  /\bgraduation\b/i,
  /\bbachelor/i,
  /post basic/i,
  /\bpg\b/i,
  /\bpostgraduate\b/i,
  /\bmaster/i
];
const TWELFTH_LEVEL_SIGNALS = [
  /10\+2/i,
  /\b12th\b/i,
  /\bintermediate\b/i,
  /\bpcm\b/i,
  /\bpcb\b/i,
  /\bjee\b/i,
  /\bneet\b/i,
  /\bkeam\b/i
];
const TRACK_KEYWORDS = {
  engineering: [
    "engineering",
    "btech",
    "technology",
    "computer",
    "electronics",
    "mechanical",
    "civil",
    "it",
    "software",
    "jee",
    "keam",
    "pcm"
  ],
  medical: [
    "medical",
    "mbbs",
    "bds",
    "nursing",
    "pharmacy",
    "allied health",
    "physiotherapy",
    "neet",
    "biology",
    "pcb"
  ],
  commerce: [
    "commerce",
    "management",
    "bcom",
    "bba",
    "business",
    "finance",
    "accounting",
    "economics",
    "marketing"
  ],
  law: ["law", "llb", "legal", "clat", "klee"],
  arts: [
    "arts",
    "ba",
    "design",
    "media",
    "psychology",
    "humanities",
    "communication",
    "journalism",
    "english",
    "fashion"
  ]
};

const toTrimmedString = (value) => String(value || "").trim();
const toLower = (value) => toTrimmedString(value).toLowerCase();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const includesAnyToken = (text, tokens) => tokens.some((token) => text.includes(token));

const tokenize = (value) =>
  toLower(value)
    .split(/[^a-z0-9+]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);

const resolveTrack = (value) => {
  const text = toLower(value);
  return (
    Object.entries(TRACK_KEYWORDS).find(([, tokens]) => includesAnyToken(text, tokens))?.[0] ||
    null
  );
};

export const normalizeEligibleAcademicLevels = (value) => {
  const values = Array.isArray(value)
    ? value
    : toTrimmedString(value)
        .split(",")
        .map((item) => item.trim());

  return [...new Set(values.filter((item) => SUPPORTED_ACADEMIC_LEVELS.has(item)))];
};

export const serializeEligibleAcademicLevels = (value) =>
  normalizeEligibleAcademicLevels(value).join(",");

export const normalizeCourseDeliveryMode = (value) => {
  const normalized = toLower(value);
  return SUPPORTED_DELIVERY_MODES.has(normalized) ? normalized : "";
};

export const buildGeneratedCourseCode = ({ title, universityName, userId }) => {
  const source = `${toLower(universityName).slice(0, 8)}-${toLower(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16)}`;
  const compact = source
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 4))
    .join("")
    .slice(0, 12)
    .toUpperCase();

  return `${compact || "COURSE"}-${String(userId || "U").slice(-3)}-${Date.now()
    .toString()
    .slice(-4)}`;
};

export const buildUniversityProfileComplete = (user) =>
  Boolean(
    user.university_name &&
      user.university_state &&
      user.university_city
  );

export const validateSchoolAdmissionsCourse = ({ eligibleAcademicLevels, qualificationRequired }) => {
  const normalizedLevels = normalizeEligibleAcademicLevels(eligibleAcademicLevels);
  const qualificationText = toTrimmedString(qualificationRequired);

  if (normalizedLevels.length === 0) {
    return "Select whether 10th students, 12th students, or both can apply.";
  }

  if (!qualificationText) {
    return "Qualification required is mandatory for every course listing.";
  }

  if (SCHOOL_LEVEL_BLOCKERS.some((pattern) => pattern.test(qualificationText))) {
    return "This qualification looks like a UG/PG-level requirement. EduVista student admissions should stay limited to school-level entry courses.";
  }

  if (
    normalizedLevels.includes("10") &&
    normalizedLevels.length === 1 &&
    TWELFTH_LEVEL_SIGNALS.some((pattern) => pattern.test(qualificationText))
  ) {
    return "10th-only eligibility conflicts with a 12th-level qualification requirement.";
  }

  return null;
};

export const evaluateStudentCourseEligibility = ({ course, profile }) => {
  const eligibleLevels = normalizeEligibleAcademicLevels(course?.eligible_academic_levels);
  const academicLevel = toTrimmedString(profile?.academic_level);
  const minimumScorePercent =
    course?.minimum_score_percent === null ||
    course?.minimum_score_percent === undefined ||
    course?.minimum_score_percent === ""
      ? null
      : Number(course.minimum_score_percent);
  const scorePercent =
    profile?.score_percent === null ||
    profile?.score_percent === undefined ||
    profile?.score_percent === ""
      ? null
      : Number(profile.score_percent);

  const reasons = [];

  if (eligibleLevels.length > 0) {
    if (!academicLevel) {
      reasons.push("Complete your student profile academic level before applying.");
    } else if (!eligibleLevels.includes(academicLevel)) {
      reasons.push(
        `This course accepts ${eligibleLevels.map((level) => `${level}th`).join(" / ")} students only.`
      );
    }
  }

  if (minimumScorePercent !== null) {
    if (scorePercent === null || Number.isNaN(scorePercent)) {
      reasons.push("Add your percentage in the student profile to verify eligibility.");
    } else if (scorePercent < minimumScorePercent) {
      reasons.push(`Minimum ${minimumScorePercent}% is required for this course.`);
    }
  }

  const qualificationText = toTrimmedString(course?.qualification_required);
  if (SCHOOL_LEVEL_BLOCKERS.some((pattern) => pattern.test(qualificationText))) {
    reasons.push("This listing is not suitable for school-level student admissions.");
  }

  const summaryParts = [];
  if (eligibleLevels.length > 0) {
    summaryParts.push(`${eligibleLevels.map((level) => `${level}th`).join(" / ")} students`);
  }
  if (minimumScorePercent !== null) {
    summaryParts.push(`${minimumScorePercent}% and above`);
  }

  return {
    eligibleAcademicLevels: eligibleLevels,
    minimumScorePercent,
    isEligible: reasons.length === 0,
    reasons,
    summary: summaryParts.length > 0 ? summaryParts.join(" | ") : "Open to all students"
  };
};

export const buildStudentCourseRecommendation = ({ course, profile, eligibility }) => {
  const combinedCourseText = [
    course?.category,
    course?.title,
    course?.qualification_required,
    course?.description
  ]
    .map(toTrimmedString)
    .join(" ")
    .toLowerCase();
  const studentInterestText = [
    profile?.target_course,
    profile?.stream_name,
    profile?.marks_summary,
    profile?.bio
  ]
    .map(toTrimmedString)
    .join(" ")
    .toLowerCase();
  const targetTokens = [...new Set(tokenize(profile?.target_course))];
  const matchedInterestTokens = targetTokens.filter((token) => combinedCourseText.includes(token));
  const studentTrack = resolveTrack(studentInterestText);
  const courseTrack = resolveTrack(combinedCourseText);
  const reasons = [];
  let score = eligibility?.isEligible ? 48 : 12;

  if (courseTrack && studentTrack && courseTrack === studentTrack) {
    score += 22;
    reasons.push(`${course.category || "Course"} matches the student's current interest area.`);
  }

  if (matchedInterestTokens.length > 0) {
    score += Math.min(18, matchedInterestTokens.length * 6);
    reasons.push(`Matches the student's target interest: ${matchedInterestTokens.slice(0, 3).join(", ")}.`);
  }

  if (profile?.score_percent !== null && profile?.score_percent !== undefined && !Number.isNaN(Number(profile.score_percent))) {
    if (eligibility?.minimumScorePercent !== null) {
      const scoreGap = Number(profile.score_percent) - Number(eligibility.minimumScorePercent);
      if (scoreGap >= 10) {
        score += 8;
        reasons.push("Student score comfortably exceeds the minimum requirement.");
      } else if (scoreGap >= 0) {
        score += 5;
        reasons.push("Student score meets the listed eligibility.");
      }
    } else {
      score += 4;
    }
  }

  if (profile?.document_count) {
    score += Math.min(6, Number(profile.document_count) * 2);
  }

  if (profile?.marks_summary) {
    score += 4;
  }

  if (profile?.bio) {
    score += 2;
  }

  if (!eligibility?.isEligible && eligibility?.reasons?.length) {
    reasons.unshift(eligibility.reasons[0]);
  }

  const normalizedScore = clamp(Math.round(score), 0, 100);

  return {
    score: normalizedScore,
    band:
      normalizedScore >= 80
        ? "high"
        : normalizedScore >= 60
          ? "medium"
          : "low",
    reasons: reasons.slice(0, 3)
  };
};
