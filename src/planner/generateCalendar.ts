export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;
export const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

export type WeekdayShort = (typeof WEEKDAY_SHORT)[number];

export interface CalendarCell {
  date: Date;
  dayNumber: number;
  inMonth: boolean;
  month: number;
  year: number;
}

export interface CalendarMonth {
  year: number;
  month: number;
  monthName: string;
  weeks: CalendarCell[][];
}

export function generateCalendar(year: number, month: number): CalendarMonth {
  const firstOfMonth = new Date(year, month - 1, 1);
  // getDay() returns 0=Sunday … 6=Saturday, which matches our Sunday-first grid.
  const firstWeekdayOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month - 1, 1 - firstWeekdayOffset);

  const weeks: CalendarCell[][] = [];
  for (let row = 0; row < 6; row += 1) {
    const week: CalendarCell[] = [];

    for (let col = 0; col < 7; col += 1) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + row * 7 + col);

      week.push({
        date: cellDate,
        dayNumber: cellDate.getDate(),
        inMonth: cellDate.getMonth() === month - 1,
        month: cellDate.getMonth() + 1,
        year: cellDate.getFullYear(),
      });
    }

    weeks.push(week);
  }

  return {
    year,
    month,
    monthName: MONTH_NAMES[month - 1],
    weeks,
  };
}

export function shiftMonth(year: number, month: number, offset: number): {
  year: number;
  month: number;
  monthName: string;
} {
  const shifted = new Date(year, month - 1 + offset, 1);
  const shiftedMonth = shifted.getMonth() + 1;

  return {
    year: shifted.getFullYear(),
    month: shiftedMonth,
    monthName: MONTH_NAMES[shiftedMonth - 1],
  };
}

export function formatWeekRange(week: CalendarCell[]): string {
  const start = week[0];
  const end = week[week.length - 1];

  if (!start || !end) {
    return "Week";
  }

  const startMonthName = MONTH_NAMES[start.month - 1];
  const endMonthName = MONTH_NAMES[end.month - 1];

  if (start.month === end.month && start.year === end.year) {
    return `${startMonthName} ${start.dayNumber}-${end.dayNumber}`;
  }

  return `${startMonthName} ${start.dayNumber}-${endMonthName} ${end.dayNumber}`;
}
