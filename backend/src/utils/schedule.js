const DAY_ALIAS = {
  MON: "MON",
  MONDAY: "MON",
  TUE: "TUE",
  TUES: "TUE",
  TUESDAY: "TUE",
  WED: "WED",
  WEDNESDAY: "WED",
  THU: "THU",
  THUR: "THU",
  THURS: "THU",
  THURSDAY: "THU",
  FRI: "FRI",
  FRIDAY: "FRI",
  SAT: "SAT",
  SATURDAY: "SAT",
  SUN: "SUN",
  SUNDAY: "SUN"
};

const toMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
};

const normalizeDay = (value) => {
  const key = value.replace(/[^a-z]/gi, "").toUpperCase();
  return DAY_ALIAS[key] || null;
};

export const parseScheduleBlock = (scheduleBlock) => {
  if (!scheduleBlock || typeof scheduleBlock !== "string") {
    return [];
  }

  const match = scheduleBlock
    .trim()
    .match(/^([A-Za-z,\s\/]+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);

  if (!match) {
    return [];
  }

  const [, dayChunk, startTimeRaw, endTimeRaw] = match;
  const start = toMinutes(startTimeRaw);
  const end = toMinutes(endTimeRaw);
  if (start === null || end === null || start >= end) {
    return [];
  }

  const days = dayChunk
    .split(/[,\s/]+/)
    .map(normalizeDay)
    .filter(Boolean);

  return days.map((day) => ({ day, start, end }));
};

export const hasScheduleConflict = (scheduleA, scheduleB) => {
  const slotsA = parseScheduleBlock(scheduleA);
  const slotsB = parseScheduleBlock(scheduleB);

  for (const first of slotsA) {
    for (const second of slotsB) {
      const overlaps =
        first.day === second.day &&
        first.start < second.end &&
        second.start < first.end;
      if (overlaps) {
        return true;
      }
    }
  }

  return false;
};
