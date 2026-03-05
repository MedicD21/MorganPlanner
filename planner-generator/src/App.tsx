import { useState } from "react";
import "./App.css";
import MonthlyView from "./planner/MonthlyView";

const DEFAULT_YEAR = 2026;
const DEFAULT_MONTH = 3;
const DEFAULT_WEEK_INDEX = 2;

export default function App() {
  const [month, setMonth] = useState<number>(DEFAULT_MONTH);
  const [weekIndex, setWeekIndex] = useState<number>(DEFAULT_WEEK_INDEX);

  const handleMonthTabChange = (nextMonth: number) => {
    setMonth(nextMonth);
    setWeekIndex(0);
  };

  const handleWeekTabChange = (nextWeekIndex: number) => {
    setWeekIndex(nextWeekIndex);
  };

  return (
    <main className="app-shell">
      <MonthlyView
        year={DEFAULT_YEAR}
        month={month}
        weekIndex={weekIndex}
        allowTouchInk={false}
        onMonthChange={handleMonthTabChange}
        onWeekIndexChange={handleWeekTabChange}
      />
    </main>
  );
}
