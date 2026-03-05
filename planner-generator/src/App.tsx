import { useMemo, useState } from "react";
import "./App.css";
import MonthlyView from "./planner/MonthlyView";
import { MONTH_NAMES, formatWeekRange, generateCalendar } from "./planner/generateCalendar";
import type { InkInputType } from "./planner/InkLayer";

const DEFAULT_YEAR = 2026;
const DEFAULT_MONTH = 3;
const DEFAULT_WEEK_INDEX = 2;

type InkInputState = InkInputType | "none";

function formatInkInputLabel(value: InkInputState): string {
  if (value === "none") {
    return "waiting";
  }

  if (value === "pen") {
    return "Apple Pencil / stylus";
  }

  if (value === "touch") {
    return "touch";
  }

  if (value === "mouse") {
    return "mouse";
  }

  return value;
}

export default function App() {
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [month, setMonth] = useState<number>(DEFAULT_MONTH);
  const [weekIndex, setWeekIndex] = useState<number>(DEFAULT_WEEK_INDEX);
  const [allowTouchInk, setAllowTouchInk] = useState<boolean>(false);
  const [lastInkInput, setLastInkInput] = useState<InkInputState>("none");

  const calendarData = useMemo(() => generateCalendar(year, month), [year, month]);
  const safeWeekIndex = Math.max(0, Math.min(weekIndex, calendarData.weeks.length - 1));

  const handleMonthTabChange = (nextMonth: number) => {
    setMonth(nextMonth);
    setWeekIndex(0);
  };

  const handleWeekTabChange = (nextWeekIndex: number) => {
    setWeekIndex(nextWeekIndex);
  };

  return (
    <main className="app-shell">
      <section className="controls-panel">
        <h1>Digital Planner Web App</h1>
        <p>
          Apple Pencil-first planner. Swipe left or right on the weekly column to move through that month&apos;s weeks.
        </p>

        <div className="controls-row">
          <label>
            Year
            <input
              type="number"
              min={1900}
              max={2100}
              value={year}
              onChange={(event) => {
                const parsedYear = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(parsedYear)) {
                  setYear(parsedYear);
                }
              }}
            />
          </label>

          <label>
            Month
            <select
              value={month}
              onChange={(event) => {
                setMonth(Number.parseInt(event.target.value, 10));
                setWeekIndex(0);
              }}
            >
              {MONTH_NAMES.map((monthName, index) => (
                <option key={monthName} value={index + 1}>
                  {monthName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Week
            <select
              value={safeWeekIndex}
              onChange={(event) => {
                setWeekIndex(Number.parseInt(event.target.value, 10));
              }}
            >
              {calendarData.weeks.map((week, index) => (
                <option key={`${week[0]?.date.toISOString()}-${index}`} value={index}>
                  {formatWeekRange(week)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="controls-actions">
          <label className="toggle-control" htmlFor="allow-touch-ink">
            <input
              id="allow-touch-ink"
              type="checkbox"
              checked={allowTouchInk}
              onChange={(event) => {
                setAllowTouchInk(event.target.checked);
              }}
            />
            Allow finger drawing
          </label>
          <span className="ink-status">Ink input: {formatInkInputLabel(lastInkInput)}</span>
        </div>
      </section>

      <MonthlyView
        year={year}
        month={month}
        weekIndex={safeWeekIndex}
        allowTouchInk={allowTouchInk}
        onInkInputType={setLastInkInput}
        onMonthChange={handleMonthTabChange}
        onWeekIndexChange={handleWeekTabChange}
      />
    </main>
  );
}
