import { useRef } from "react";
import {
  MONTH_NAMES,
  WEEKDAY_INITIALS,
  WEEKDAY_SHORT,
  formatWeekRange,
  generateCalendar,
  shiftMonth,
  type CalendarCell,
} from "./generateCalendar";
import InkLayer, { type InkInputType } from "./InkLayer";

interface MonthlyViewProps {
  year: number;
  month: number;
  weekIndex: number;
  pageSet?: string;
  showMonthWeek?: boolean;
  showNotes?: boolean;
  allowTouchInk?: boolean;
  onInkInputType?: (inputType: InkInputType) => void;
  onMonthChange?: (month: number) => void;
  onWeekIndexChange?: (weekIndex: number) => void;
}

interface MiniCalendarProps {
  year: number;
  month: number;
}

interface MonthTabsProps {
  activeMonth: number;
  side: "left" | "right";
  pageSet: string;
  onMonthChange?: (month: number) => void;
}

interface WeekTabsProps {
  weeks: CalendarCell[][];
  activeWeekIndex: number;
  month: number;
  pageSet: string;
  onWeekIndexChange?: (weekIndex: number) => void;
}

const NOTES_RULED_LINE_COUNT = 24;

function getMonthWeekId(
  pageSet: string,
  month: number,
  weekIndex: number,
): string {
  return `${pageSet}-month-${month}-week-${weekIndex}`;
}

function getPlanningId(pageSet: string, month: number): string {
  return `${pageSet}-month-${month}-planning`;
}

function getNotesPageId(pageSet: string, month: number): string {
  return `${pageSet}-month-${month}-notes`;
}

function weekTabLabel(week: CalendarCell[]): string {
  const start = week[0];
  const end = week[week.length - 1];

  if (!start || !end) {
    return "Week";
  }

  if (start.month === end.month) {
    return `${start.dayNumber}-${end.dayNumber}`;
  }

  return `${start.dayNumber}/${start.month}-${end.dayNumber}/${end.month}`;
}

function MiniCalendar({ year, month }: MiniCalendarProps) {
  const data = generateCalendar(year, month);

  return (
    <div
      className="mini-calendar"
      aria-label={`${data.monthName} ${data.year}`}
    >
      <div className="mini-calendar-title">{data.monthName.toUpperCase()}</div>
      <div className="mini-calendar-weekdays">
        {WEEKDAY_INITIALS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="mini-calendar-grid">
        {data.weeks.map((week, weekIndexValue) =>
          week.map((cell, dayIndex) => (
            <span
              key={`${weekIndexValue}-${dayIndex}-${cell.dayNumber}-${cell.month}`}
              className={cell.inMonth ? "mini-day" : "mini-day muted"}
            >
              {cell.inMonth ? cell.dayNumber : ""}
            </span>
          )),
        )}
      </div>
    </div>
  );
}

function MonthTabs({
  activeMonth,
  side,
  pageSet,
  onMonthChange,
}: MonthTabsProps) {
  return (
    <div className={`month-tabs month-tabs-${side}`} aria-label="Month tabs">
      {MONTH_NAMES.map((name, index) => {
        const monthValue = index + 1;
        const isActive = monthValue === activeMonth;
        const className = isActive ? "month-tab active" : "month-tab";

        return (
          <a
            key={name}
            className={className}
            href={`#${getMonthWeekId(pageSet, monthValue, 0)}`}
            onClick={
              onMonthChange
                ? (event) => {
                    event.preventDefault();
                    onMonthChange(monthValue);
                  }
                : undefined
            }
            aria-current={isActive ? "page" : undefined}
            title={`Go to ${name}`}
          >
            {name.slice(0, 3).toUpperCase()}
          </a>
        );
      })}

      {side === "right" ? (
        <a
          className="month-tab month-tab-notes"
          href={`#${getNotesPageId(pageSet, activeMonth)}`}
          title="Go to notes"
        >
          NOTES
        </a>
      ) : null}
    </div>
  );
}

function WeekTabs({
  weeks,
  activeWeekIndex,
  month,
  pageSet,
  onWeekIndexChange,
}: WeekTabsProps) {
  const isInteractive = typeof onWeekIndexChange === "function";

  return (
    <nav className="week-tabs" aria-label="Week tabs">
      {weeks.map((week, index) => {
        const isActive = index === activeWeekIndex;
        const className = isActive ? "week-tab active" : "week-tab";
        const label = weekTabLabel(week);
        const fullLabel = formatWeekRange(week);

        if (isInteractive) {
          return (
            <button
              key={`week-tab-${index}`}
              type="button"
              className={className}
              onClick={() => onWeekIndexChange(index)}
              aria-pressed={isActive}
              title={fullLabel}
            >
              {label}
            </button>
          );
        }

        return (
          <a
            key={`week-tab-${index}`}
            className={className}
            href={`#${getMonthWeekId(pageSet, month, index)}`}
            title={fullLabel}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}

function renderWeeklyRows(week: CalendarCell[]) {
  return week.map((cell, index) => (
    <div
      key={`${cell.year}-${cell.month}-${cell.dayNumber}-${index}`}
      className="weekly-row"
    >
      <div className="weekly-row-label">{`${cell.dayNumber} ${WEEKDAY_SHORT[index]}`}</div>
    </div>
  ));
}

export default function MonthlyView({
  year,
  month,
  weekIndex,
  pageSet = "preview",
  showMonthWeek = true,
  showNotes = true,
  allowTouchInk = false,
  onInkInputType,
  onMonthChange,
  onWeekIndexChange,
}: MonthlyViewProps) {
  const calendarData = generateCalendar(year, month);
  const safeWeekIndex = Math.max(
    0,
    Math.min(weekIndex, calendarData.weeks.length - 1),
  );
  const selectedWeek =
    calendarData.weeks[safeWeekIndex] ?? calendarData.weeks[0];

  const nextMonth = shiftMonth(year, month, 1);
  const monthAfterNext = shiftMonth(year, month, 2);
  const weekSwipeStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  const weekTitle = formatWeekRange(selectedWeek);

  if (!showMonthWeek && !showNotes) {
    return null;
  }

  const monthWeekId = getMonthWeekId(pageSet, month, safeWeekIndex);
  const planningId = getPlanningId(pageSet, month);
  const notesPageId = getNotesPageId(pageSet, month);

  const handleWeekSwipeStart = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch") {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest("a, button")) {
      return;
    }

    weekSwipeStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const handleWeekSwipeEnd = (event: React.PointerEvent<HTMLElement>) => {
    const swipeStart = weekSwipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) {
      return;
    }

    weekSwipeStartRef.current = null;

    const deltaX = event.clientX - swipeStart.startX;
    const deltaY = event.clientY - swipeStart.startY;
    const isHorizontalSwipe = Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
    if (!isHorizontalSwipe || !onWeekIndexChange) {
      return;
    }

    const nextIndex = deltaX < 0 ? safeWeekIndex + 1 : safeWeekIndex - 1;
    const clampedIndex = Math.max(0, Math.min(calendarData.weeks.length - 1, nextIndex));
    if (clampedIndex !== safeWeekIndex) {
      onWeekIndexChange(clampedIndex);
    }
  };

  const clearWeekSwipe = () => {
    weekSwipeStartRef.current = null;
  };

  return (
    <div className="planner-previews">
      {showMonthWeek ? (
        <section
          id={monthWeekId}
          className="planner-spread planner-print-page"
          data-planner-page
          data-planner-set={pageSet}
          data-planner-kind="month-week"
        >
          <article className="planner-paper month-paper">
            <header className="month-header">
              <div className="month-number">{month}</div>

              <div className="month-meta">
                <div className="month-meta-row">
                  <span className="month-meta-label">MONTH:</span>
                  <span className="month-meta-value">
                    <span>{calendarData.monthName.toLowerCase()}</span>
                  </span>
                </div>
                <div className="month-meta-row">
                  <span className="month-meta-label">YEAR:</span>
                  <span className="month-meta-value">
                    <span>{calendarData.year}</span>
                  </span>
                </div>
              </div>

              <div className="mini-calendars-wrap">
                <MiniCalendar year={nextMonth.year} month={nextMonth.month} />
                <MiniCalendar
                  year={monthAfterNext.year}
                  month={monthAfterNext.month}
                />
              </div>
            </header>

            <div className="month-calendar">
              <div className="weekday-row">
                {WEEKDAY_INITIALS.map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>

              <div className="calendar-grid">
                {calendarData.weeks.map((week, rowIndex) =>
                  week.map((cell, colIndex) => (
                    <div
                      key={`${rowIndex}-${colIndex}-${cell.year}-${cell.month}-${cell.dayNumber}`}
                      className={cell.inMonth ? "calendar-cell" : "calendar-cell outside-month"}
                    >
                        <span>{cell.dayNumber}</span>
                    </div>
                  )),
                )}
              </div>
            </div>
            <InkLayer
              pageId={`${pageSet}-ink-${year}-month-${month}`}
              allowTouch={allowTouchInk}
              onInputType={onInkInputType}
            />
          </article>

          <article
            className="planner-paper week-paper"
            onPointerDown={handleWeekSwipeStart}
            onPointerUp={handleWeekSwipeEnd}
            onPointerCancel={clearWeekSwipe}
          >
            <MonthTabs
              activeMonth={month}
              side="right"
              pageSet={pageSet}
              onMonthChange={onMonthChange}
            />
            <header className="week-header">{weekTitle}</header>
            <WeekTabs
              weeks={calendarData.weeks}
              activeWeekIndex={safeWeekIndex}
              month={month}
              pageSet={pageSet}
              onWeekIndexChange={onWeekIndexChange}
            />
            <a
              className="spread-link to-planning-link"
              href={`#${planningId}`}
              title="Go to planning page"
            >
              to do page
            </a>
            <div className="week-lines">{renderWeeklyRows(selectedWeek)}</div>
            <InkLayer
              pageId={`${pageSet}-ink-${year}-month-${month}-week-${safeWeekIndex}`}
              allowTouch={allowTouchInk}
              onInputType={onInkInputType}
            />
          </article>
        </section>
      ) : null}

      {showNotes ? (
        <section
          id={planningId}
          className="planner-spread notes-spread planner-print-page"
          data-planner-page
          data-planner-set={pageSet}
          data-planner-kind="planning"
        >
          <article className="planner-paper notes-left-paper">
            <div className="notes-left-top">
              <span>to do today</span>
              <span>this week</span>
            </div>

            <div className="notes-left-grid">
              <div className="notes-today-col">
                {WEEKDAY_INITIALS.map((day, index) => (
                  <div key={`${day}-${index}`} className="notes-day-row">
                    <span>{day}</span>
                  </div>
                ))}
              </div>
              <div className="notes-week-col" />
            </div>
            <InkLayer
              pageId={`${pageSet}-ink-${year}-month-${month}-planning-left`}
              allowTouch={allowTouchInk}
              onInputType={onInkInputType}
            />
          </article>

          <article className="planner-paper notes-main-paper">
            <div className="notes-main-layout">
              <div className="dot-grid-panel" />
              <div className="todo-month-panel">
                <h3>to do this month</h3>
                <MonthTabs
                  activeMonth={month}
                  side="right"
                  pageSet={pageSet}
                  onMonthChange={onMonthChange}
                />
              </div>
            </div>
            <InkLayer
              pageId={`${pageSet}-ink-${year}-month-${month}-planning-right`}
              allowTouch={allowTouchInk}
              onInputType={onInkInputType}
            />
          </article>
        </section>
      ) : null}

      {showNotes ? (
        <section
          id={notesPageId}
          className="planner-spread notes-page-spread planner-print-page"
          data-planner-page
          data-planner-set={pageSet}
          data-planner-kind="notes"
        >
          <article className="planner-paper notes-ruled-paper">
            <header className="notes-page-header">notes</header>
            <div className="ruled-notes-body">
              {Array.from({ length: NOTES_RULED_LINE_COUNT }).map(
                (_, index) => (
                  <div key={`ruled-line-${index}`} className="ruled-line" />
                ),
              )}
            </div>
            <InkLayer
              pageId={`${pageSet}-ink-${year}-month-${month}-notes-left`}
              allowTouch={allowTouchInk}
              onInputType={onInkInputType}
            />
          </article>

          <article className="planner-paper notes-dotted-paper">
            <header className="notes-page-header">ideas</header>
            <div className="dotted-notes-body" />
            <MonthTabs
              activeMonth={month}
              side="right"
              pageSet={pageSet}
              onMonthChange={onMonthChange}
            />
            <InkLayer
              pageId={`${pageSet}-ink-${year}-month-${month}-notes-right`}
              allowTouch={allowTouchInk}
              onInputType={onInkInputType}
            />
          </article>
        </section>
      ) : null}
    </div>
  );
}
