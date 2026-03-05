import { useEffect, useRef, useState } from "react";
import {
  MONTH_NAMES,
  WEEKDAY_INITIALS,
  WEEKDAY_SHORT,
  formatWeekRange,
  generateCalendar,
  shiftMonth,
  type CalendarCell,
} from "./generateCalendar";
import InkLayer, { type InkInputType, type InkTipKind } from "./InkLayer";

interface MonthlyViewProps {
  year: number;
  month: number;
  weekIndex: number;
  pageSet?: string;
  showMonthWeek?: boolean;
  showNotes?: boolean;
  allowTouchInk?: boolean;
  inkColor?: string;
  inkLineWidth?: number;
  inkOpacity?: number;
  inkSymbol?: string | null;
  inkTipKind?: InkTipKind;
  inkMode?:
    | "draw"
    | "erase"
    | "bucket"
    | "shape"
    | "lasso"
    | "image"
    | "sticky";
  inkShapeKind?: "line" | "rectangle" | "ellipse";
  inkImageSrc?: string | null;
  inkEraseRadius?: number;
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
  onOpenMonthWeek?: () => void;
  onOpenNotes?: () => void;
}

interface WeekTabsProps {
  weeks: CalendarCell[][];
  activeWeekIndex: number;
  month: number;
  pageSet: string;
  onWeekIndexChange?: (weekIndex: number) => void;
}

const NOTES_RULED_LINE_COUNT = 24;
type SpreadView = "month-week" | "planning" | "notes";

function updateHash(hashValue: string): void {
  if (window.location.hash === hashValue) {
    return;
  }

  window.history.pushState(null, "", hashValue);
}

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
  onOpenMonthWeek,
  onOpenNotes,
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
                    onOpenMonthWeek?.();
                    onMonthChange(monthValue);
                    updateHash(`#${getMonthWeekId(pageSet, monthValue, 0)}`);
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
          onClick={(event) => {
            event.preventDefault();
            onOpenNotes?.();
            updateHash(`#${getNotesPageId(pageSet, activeMonth)}`);
          }}
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
      data-ink-cell
    >
      <div className="weekly-row-label">{`${cell.dayNumber} ${WEEKDAY_SHORT[index]}`}</div>
    </div>
  ));
}

export default function MonthlyView({
  year,
  month,
  weekIndex,
  pageSet = "planner",
  showMonthWeek = true,
  showNotes = true,
  allowTouchInk = false,
  inkColor = "#2f2b2a",
  inkLineWidth = 1.7,
  inkOpacity = 1,
  inkSymbol = null,
  inkTipKind = "round",
  inkMode = "draw",
  inkShapeKind = "line",
  inkImageSrc = null,
  inkEraseRadius = 14,
  onInkInputType,
  onMonthChange,
  onWeekIndexChange,
}: MonthlyViewProps) {
  const [activeView, setActiveView] = useState<SpreadView>("month-week");
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
  const monthSwipeStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  const weekTitle = formatWeekRange(selectedWeek);

  const monthWeekId = getMonthWeekId(pageSet, month, safeWeekIndex);
  const planningId = getPlanningId(pageSet, month);
  const notesPageId = getNotesPageId(pageSet, month);

  useEffect(() => {
    const parseHash = () => {
      const hash = window.location.hash;

      if (!hash) {
        setActiveView("month-week");
        return;
      }

      if (hash === `#${planningId}`) {
        setActiveView("planning");
        return;
      }

      if (hash === `#${notesPageId}`) {
        setActiveView("notes");
        return;
      }

      const escapedPageSet = pageSet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const monthWeekPattern = new RegExp(`^#${escapedPageSet}-month-(\\d+)-week-(\\d+)$`);
      const match = hash.match(monthWeekPattern);

      if (!match) {
        setActiveView("month-week");
        return;
      }

      const hashMonth = Number.parseInt(match[1], 10);
      const hashWeek = Number.parseInt(match[2], 10);
      const clampedWeek = Math.max(0, Math.min(calendarData.weeks.length - 1, hashWeek));

      setActiveView("month-week");

      if (Number.isFinite(hashMonth) && hashMonth >= 1 && hashMonth <= 12 && hashMonth !== month) {
        onMonthChange?.(hashMonth);
      }

      if (Number.isFinite(clampedWeek) && clampedWeek !== safeWeekIndex) {
        onWeekIndexChange?.(clampedWeek);
      }
    };

    parseHash();
    window.addEventListener("hashchange", parseHash);
    window.addEventListener("popstate", parseHash);

    return () => {
      window.removeEventListener("hashchange", parseHash);
      window.removeEventListener("popstate", parseHash);
    };
  }, [
    calendarData.weeks.length,
    month,
    notesPageId,
    onMonthChange,
    onWeekIndexChange,
    pageSet,
    planningId,
    safeWeekIndex,
  ]);

  if (!showMonthWeek && !showNotes) {
    return null;
  }

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

  const handleMonthSwipeStart = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch") {
      return;
    }

    if (event.target instanceof HTMLElement) {
      if (event.target.closest("a, button")) {
        return;
      }
    }

    monthSwipeStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const handleMonthSwipeEnd = (event: React.PointerEvent<HTMLElement>) => {
    const swipeStart = monthSwipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) {
      return;
    }

    monthSwipeStartRef.current = null;

    const deltaX = event.clientX - swipeStart.startX;
    const deltaY = event.clientY - swipeStart.startY;
    const isVerticalSwipe =
      Math.abs(deltaY) > 70 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2;
    if (!isVerticalSwipe || !onMonthChange) {
      return;
    }

    const nextMonth =
      deltaY < 0
        ? month === 12
          ? 1
          : month + 1
        : month === 1
          ? 12
          : month - 1;

    onMonthChange(nextMonth);
    updateHash(`#${getMonthWeekId(pageSet, nextMonth, 0)}`);
  };

  const clearMonthSwipe = () => {
    monthSwipeStartRef.current = null;
  };

  return (
    <div className="planner-previews">
      {showMonthWeek ? (
        <section
          id={monthWeekId}
          className={activeView === "month-week" ? "planner-spread is-active" : "planner-spread"}
        >
          <article
            className="planner-paper month-paper"
            onPointerDown={handleMonthSwipeStart}
            onPointerUp={handleMonthSwipeEnd}
            onPointerCancel={clearMonthSwipe}
          >
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
                      data-ink-cell
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
              color={inkColor}
              lineWidth={inkLineWidth}
              opacity={inkOpacity}
              symbol={inkSymbol}
              tipKind={inkTipKind}
              mode={inkMode}
              shapeKind={inkShapeKind}
              imageSrc={inkImageSrc}
              eraseRadius={inkEraseRadius}
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
              onOpenMonthWeek={() => {
                setActiveView("month-week");
              }}
              onOpenNotes={() => {
                setActiveView("notes");
              }}
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
              onClick={(event) => {
                event.preventDefault();
                setActiveView("planning");
                updateHash(`#${planningId}`);
              }}
              title="Go to planning page"
            >
              to do page
            </a>
            <div className="week-lines">{renderWeeklyRows(selectedWeek)}</div>
            <InkLayer
              pageId={`${pageSet}-ink-${year}-month-${month}-week-${safeWeekIndex}`}
              allowTouch={allowTouchInk}
              color={inkColor}
              lineWidth={inkLineWidth}
              opacity={inkOpacity}
              symbol={inkSymbol}
              tipKind={inkTipKind}
              mode={inkMode}
              shapeKind={inkShapeKind}
              imageSrc={inkImageSrc}
              eraseRadius={inkEraseRadius}
              onInputType={onInkInputType}
            />
          </article>
        </section>
      ) : null}

      {showNotes ? (
        <section
          id={planningId}
          className={
            activeView === "planning"
              ? "planner-spread notes-spread is-active"
              : "planner-spread notes-spread"
          }
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
              color={inkColor}
              lineWidth={inkLineWidth}
              opacity={inkOpacity}
              symbol={inkSymbol}
              tipKind={inkTipKind}
              mode={inkMode}
              shapeKind={inkShapeKind}
              imageSrc={inkImageSrc}
              eraseRadius={inkEraseRadius}
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
                  onOpenMonthWeek={() => {
                    setActiveView("month-week");
                  }}
                  onOpenNotes={() => {
                    setActiveView("notes");
                  }}
                />
              </div>
            </div>
            <InkLayer
              pageId={`${pageSet}-ink-${year}-month-${month}-planning-right`}
              allowTouch={allowTouchInk}
              color={inkColor}
              lineWidth={inkLineWidth}
              opacity={inkOpacity}
              symbol={inkSymbol}
              tipKind={inkTipKind}
              mode={inkMode}
              shapeKind={inkShapeKind}
              imageSrc={inkImageSrc}
              eraseRadius={inkEraseRadius}
              onInputType={onInkInputType}
            />
          </article>
        </section>
      ) : null}

      {showNotes ? (
        <section
          id={notesPageId}
          className={
            activeView === "notes"
              ? "planner-spread notes-page-spread is-active"
              : "planner-spread notes-page-spread"
          }
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
              color={inkColor}
              lineWidth={inkLineWidth}
              opacity={inkOpacity}
              symbol={inkSymbol}
              tipKind={inkTipKind}
              mode={inkMode}
              shapeKind={inkShapeKind}
              imageSrc={inkImageSrc}
              eraseRadius={inkEraseRadius}
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
              onOpenMonthWeek={() => {
                setActiveView("month-week");
              }}
              onOpenNotes={() => {
                setActiveView("notes");
              }}
            />
            <InkLayer
              pageId={`${pageSet}-ink-${year}-month-${month}-notes-right`}
              allowTouch={allowTouchInk}
              color={inkColor}
              lineWidth={inkLineWidth}
              opacity={inkOpacity}
              symbol={inkSymbol}
              tipKind={inkTipKind}
              mode={inkMode}
              shapeKind={inkShapeKind}
              imageSrc={inkImageSrc}
              eraseRadius={inkEraseRadius}
              onInputType={onInkInputType}
            />
          </article>
        </section>
      ) : null}
    </div>
  );
}
