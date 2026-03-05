import { useMemo, useState } from "react";
import "./App.css";
import MonthlyView from "./planner/MonthlyView";
import { exportPlanner } from "./planner/exportPDF";
import {
  MONTH_NAMES,
  formatWeekRange,
  generateCalendar,
} from "./planner/generateCalendar";

const DEFAULT_YEAR = 2026;
const DEFAULT_MONTH = 3;
const DEFAULT_WEEK_INDEX = 2;

export default function App() {
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [month, setMonth] = useState<number>(DEFAULT_MONTH);
  const [weekIndex, setWeekIndex] = useState<number>(DEFAULT_WEEK_INDEX);

  const calendarData = useMemo(
    () => generateCalendar(year, month),
    [year, month],
  );
  const safeWeekIndex = Math.max(
    0,
    Math.min(weekIndex, calendarData.weeks.length - 1),
  );
  const yearExportMonths = useMemo(
    () =>
      MONTH_NAMES.map((_, monthIndex) => {
        const monthValue = monthIndex + 1;
        return {
          month: monthValue,
          weekCount: generateCalendar(year, monthValue).weeks.length,
        };
      }),
    [year],
  );
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
        <h1>GoodNotes Planner Builder</h1>
        <p>
          Monthly + weekly spread and notes spread styled to match your
          reference.
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
                <option
                  key={`${week[0]?.date.toISOString()}-${index}`}
                  value={index}
                >
                  {formatWeekRange(week)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="controls-actions">
          <button
            type="button"
            onClick={() =>
              exportPlanner({
                pageSet: "preview",
                title: `GoodNotes Planner ${month}/${year}`,
              })
            }
          >
            Export Current Spread
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() =>
              exportPlanner({
                pageSet: "year",
                title: `GoodNotes Planner ${year}`,
              })
            }
          >
            Export Full Year
          </button>
        </div>
      </section>

      <MonthlyView
        year={year}
        month={month}
        weekIndex={safeWeekIndex}
        onMonthChange={handleMonthTabChange}
        onWeekIndexChange={handleWeekTabChange}
      />

      <div className="year-export-source" aria-hidden="true">
        {yearExportMonths.map(({ month: exportMonth, weekCount }) => (
          <div key={`export-month-${exportMonth}`}>
            {Array.from({ length: weekCount }).map((_, exportWeekIndex) => (
              <MonthlyView
                key={`export-month-${exportMonth}-week-${exportWeekIndex}`}
                year={year}
                month={exportMonth}
                weekIndex={exportWeekIndex}
                pageSet="year"
                showNotes={false}
              />
            ))}
            <MonthlyView
              key={`export-month-${exportMonth}-notes`}
              year={year}
              month={exportMonth}
              weekIndex={0}
              pageSet="year"
              showMonthWeek={false}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
