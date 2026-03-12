import SwiftUI

struct MonthWeekSpreadView: View {
    @EnvironmentObject private var store: PlannerStore

    var body: some View {
        SpreadScaffoldView(leftRatio: 1.55, rightRatio: 1) {
            PlannerPageSurface(pageID: store.monthPageID, pageKind: .month) {
                MonthPaperBackground(year: store.year, month: store.month)
            }
            .simultaneousGesture(monthSwipeGesture)
        } right: {
            ZStack(alignment: .topTrailing) {
                PlannerPageSurface(pageID: store.weekPageID, pageKind: .week) {
                    WeekPaperBackground()
                }
                WeekPageForeground(
                    calendar: store.calendarData,
                    week: store.selectedWeek,
                    weekIndex: store.safeWeekIndex
                )
                .allowsHitTesting(true)
            }
            .simultaneousGesture(weekSwipeGesture)
        }
    }

    private var monthSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 28, coordinateSpace: .local)
            .onEnded { value in
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dy) > 70, abs(dy) > abs(dx) * 1.2 else { return }
                store.changeMonth(by: dy < 0 ? 1 : -1)
            }
    }

    private var weekSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 28, coordinateSpace: .local)
            .onEnded { value in
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dx) > 60, abs(dx) > abs(dy) * 1.2 else { return }
                store.navigateWeek(by: dx < 0 ? 1 : -1)
            }
    }
}

private struct MonthPaperBackground: View {
    let year: Int
    let month: Int

    var body: some View {
        let current = generateCalendar(year: year, month: month)
        let next = shiftMonth(year: year, month: month, offset: 1)
        let afterNext = shiftMonth(year: year, month: month, offset: 2)
        let nextData = generateCalendar(year: next.year, month: next.month)
        let afterNextData = generateCalendar(year: afterNext.year, month: afterNext.month)

        VStack(spacing: 0) {
            VStack(spacing: 10) {
                HStack(alignment: .top, spacing: 14) {
                    Text("\(month)")
                        .font(.system(size: 66, weight: .bold, design: .rounded))
                        .foregroundStyle(PlannerTheme.ink)
                        .frame(width: 84, alignment: .leading)

                    VStack(spacing: 8) {
                        MonthMetaRow(label: "MONTH:", value: current.monthName.lowercased())
                        MonthMetaRow(label: "YEAR:", value: "\(current.year)")
                    }
                    .padding(.top, 8)

                    HStack(spacing: 10) {
                        MiniCalendarCard(calendar: nextData)
                        MiniCalendarCard(calendar: afterNextData)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.top, 10)
                .padding(.bottom, 8)
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(PlannerTheme.line.opacity(0.9))
                        .frame(height: 1)
                }
            }

            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    ForEach(Array(weekdayInitials.enumerated()), id: \.offset) { _, day in
                        Text(day)
                            .font(.system(size: 12, weight: .medium, design: .default))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 3)
                    }
                }
                .overlay(alignment: .top) {
                    Rectangle().fill(PlannerTheme.line).frame(height: 1)
                }
                .overlay(alignment: .bottom) {
                    Rectangle().fill(PlannerTheme.line).frame(height: 1)
                }

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 0) {
                    ForEach(Array(current.weeks.enumerated()), id: \.offset) { rowIndex, row in
                        ForEach(Array(row.enumerated()), id: \.offset) { colIndex, cell in
                            ZStack(alignment: .topLeading) {
                                Rectangle().fill(Color.clear)
                                Text("\(cell.dayNumber)")
                                    .font(.system(size: 11, weight: .regular))
                                    .foregroundStyle(cell.inMonth ? PlannerTheme.ink : Color(hex: "#9d9891"))
                                    .padding(.leading, 4)
                                    .padding(.top, 4)
                            }
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .overlay(alignment: .bottom) {
                                Rectangle().fill(PlannerTheme.line).frame(height: 1)
                            }
                            .overlay(alignment: .trailing) {
                                Rectangle().fill(PlannerTheme.line).frame(width: 1)
                            }
                            .overlay(alignment: .leading) {
                                if colIndex == 0 {
                                    Rectangle().fill(PlannerTheme.line).frame(width: 1)
                                }
                            }
                            .id("\(rowIndex)-\(colIndex)-\(cell.id)")
                        }
                    }
                }
            }
        }
    }
}

private struct MonthMetaRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .tracking(1)
            ZStack(alignment: .bottom) {
                Rectangle()
                    .fill(PlannerTheme.line)
                    .frame(height: 1)
                Text(value)
                    .font(.system(size: 24, weight: .medium, design: .serif))
                    .padding(.horizontal, 6)
                    .background(PlannerTheme.paper)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

private struct MiniCalendarCard: View {
    let calendar: PlannerCalendarMonth

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(calendar.monthName.uppercased())
                .font(.system(size: 8, weight: .medium))
                .tracking(1)

            HStack(spacing: 0) {
                ForEach(Array(weekdayInitials.enumerated()), id: \.offset) { _, day in
                    Text(day)
                        .font(.system(size: 7, weight: .regular))
                        .foregroundStyle(Color(hex: "#585350"))
                        .frame(maxWidth: .infinity)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 0) {
                ForEach(Array(calendar.weeks.enumerated()), id: \.offset) { _, week in
                    ForEach(Array(week.enumerated()), id: \.offset) { _, cell in
                        Text(cell.inMonth ? "\(cell.dayNumber)" : "")
                            .font(.system(size: 7, weight: .regular))
                            .foregroundStyle(PlannerTheme.ink.opacity(cell.inMonth ? 1 : 0.35))
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

private struct WeekPaperBackground: View {
    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let topSection = size.height * 0.24
            let rowHeight = (size.height - topSection) / 7

            VStack(spacing: 0) {
                Color.clear
                    .frame(height: topSection)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(PlannerTheme.line).frame(height: 1)
                    }

                ForEach(0..<7, id: \.self) { _ in
                    Rectangle()
                        .fill(Color.clear)
                        .frame(height: rowHeight)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(PlannerTheme.line).frame(height: 1)
                        }
                }
            }
        }
    }
}

private struct WeekPageForeground: View {
    @EnvironmentObject private var store: PlannerStore
    let calendar: PlannerCalendarMonth
    let week: [PlannerCalendarCell]
    let weekIndex: Int

    var body: some View {
        VStack(spacing: 0) {
            Text(formatWeekRange(week))
                .font(.system(size: 30, weight: .medium, design: .serif))
                .italic()
                .padding(.top, 16)
                .padding(.bottom, 8)
                .frame(maxWidth: .infinity)
                .overlay(alignment: .top) {
                    Rectangle().fill(PlannerTheme.line).frame(height: 1)
                }
                .overlay(alignment: .bottom) {
                    Rectangle().fill(PlannerTheme.line).frame(height: 1)
                }

            WeekTabsView(weeks: calendar.weeks, activeIndex: weekIndex)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)

            Button {
                store.openSpread(.planning)
            } label: {
                Text("to do page")
                    .font(.system(size: 20, weight: .medium, design: .serif))
                    .italic()
                    .foregroundStyle(PlannerTheme.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 2)
            }
            .buttonStyle(.plain)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Color(hex: "#bcb3ad")).frame(height: 1)
            }

            VStack(spacing: 0) {
                ForEach(Array(week.enumerated()), id: \.offset) { index, cell in
                    HStack {
                        Text("\(cell.dayNumber) \(weekdayShort[index])")
                            .font(.system(size: 12, weight: .medium))
                            .tracking(0.6)
                            .padding(.leading, 11)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                }
            }
            .padding(.top, 2)
        }
        .overlay(alignment: .trailing) {
            MonthTabsView(includeNotesTab: true)
                .frame(width: 24)
                .padding(.trailing, 1)
                .padding(.vertical, 8)
        }
    }
}
