import SwiftUI

private enum MonthWeekLayout {
    static let monthHeaderRatio: CGFloat = 0.15
    static let monthWeekdayRatio: CGFloat = 0.038
    static let weekTopRatio: CGFloat = 0.225
}

struct MonthWeekSpreadView: View {
    @EnvironmentObject private var store: PlannerStore

    var body: some View {
        SpreadScaffoldView(leftRatio: 1.55, rightRatio: 1) {
            ZStack {
                PlannerPageSurface(pageID: store.monthPageID, pageKind: .month) {
                    MonthPaperBackground(year: store.year, month: store.month)
                }

                FingerSwipeNavigationOverlay(
                    axis: .vertical,
                    isEnabled: fingerSwipeEnabled,
                    onNegativeDirection: { store.changeMonth(by: 1) },
                    onPositiveDirection: { store.changeMonth(by: -1) }
                )
            }
            .simultaneousGesture(monthSwipeGesture)
        } right: {
            ZStack(alignment: .topTrailing) {
                PlannerPageSurface(pageID: store.weekPageID, pageKind: .week) {
                    WeekPaperBackground()
                }

                FingerSwipeNavigationOverlay(
                    axis: .horizontal,
                    isEnabled: fingerSwipeEnabled,
                    onNegativeDirection: { store.navigateWeek(by: 1) },
                    onPositiveDirection: { store.navigateWeek(by: -1) }
                )

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

    private var fingerSwipeEnabled: Bool {
        store.activeSpread == .monthWeek &&
        store.activeTool.supportsPencilKitDrawing &&
        !store.allowFingerDrawing &&
        store.zoomScale <= PlannerDefaults.minZoom + 0.01
    }

    private var monthSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 30, coordinateSpace: .local)
            .onEnded { value in
                guard !fingerSwipeEnabled else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dy) > 70, abs(dy) > abs(dx) * 1.2 else { return }
                store.changeMonth(by: dy < 0 ? 1 : -1)
            }
    }

    private var weekSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 30, coordinateSpace: .local)
            .onEnded { value in
                guard !fingerSwipeEnabled else { return }
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

        GeometryReader { proxy in
            let size = proxy.size
            let headerHeight = max(74, size.height * MonthWeekLayout.monthHeaderRatio)
            let weekdayHeight = max(20, size.height * MonthWeekLayout.monthWeekdayRatio)
            let gridHeight = max(0, size.height - headerHeight - weekdayHeight)
            let rowHeight = gridHeight / 6
            let cellWidth = size.width / 7

            VStack(spacing: 0) {
                HStack(alignment: .top, spacing: 14) {
                    Text("\(month)")
                        .font(.system(size: min(74, max(46, headerHeight * 0.62)), weight: .bold))
                        .foregroundStyle(PlannerTheme.ink)
                        .frame(width: 84, alignment: .leading)
                        .padding(.top, 8)

                    VStack(spacing: 10) {
                        MonthMetaRow(label: "MONTH:", value: current.monthName.lowercased())
                        MonthMetaRow(label: "YEAR:", value: "\(current.year)")
                    }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    .padding(.top, 10)

                    HStack(spacing: 10) {
                        MiniCalendarCard(calendar: nextData)
                        MiniCalendarCard(calendar: afterNextData)
                    }
                    .frame(width: min(260, size.width * 0.34), alignment: .topTrailing)
                    .padding(.top, 10)
                }
                .padding(.horizontal, 14)
                .frame(height: headerHeight)
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(PlannerTheme.line.opacity(0.95))
                        .frame(height: 1)
                }

                HStack(spacing: 0) {
                    ForEach(Array(weekdayInitials.enumerated()), id: \.offset) { _, day in
                        Text(day)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(PlannerTheme.ink)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .frame(height: weekdayHeight)
                .overlay(alignment: .top) {
                    Rectangle().fill(PlannerTheme.line).frame(height: 1)
                }
                .overlay(alignment: .bottom) {
                    Rectangle().fill(PlannerTheme.line).frame(height: 1)
                }

                VStack(spacing: 0) {
                    ForEach(Array(current.weeks.enumerated()), id: \.offset) { rowIndex, row in
                        HStack(spacing: 0) {
                            ForEach(Array(row.enumerated()), id: \.offset) { colIndex, cell in
                                ZStack(alignment: .topLeading) {
                                    Color.clear
                                    Text("\(cell.dayNumber)")
                                        .font(.system(size: max(10, rowHeight * 0.12), weight: .regular))
                                        .foregroundStyle(cell.inMonth ? PlannerTheme.ink : Color(hex: "#9d9891"))
                                        .padding(.leading, 4)
                                        .padding(.top, 4)
                                }
                                .frame(width: cellWidth, height: rowHeight, alignment: .topLeading)
                                .overlay(alignment: .trailing) {
                                    Rectangle().fill(PlannerTheme.line).frame(width: 1)
                                }
                                .overlay(alignment: .bottom) {
                                    Rectangle().fill(PlannerTheme.line).frame(height: 1)
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
                .frame(height: gridHeight)
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
                .frame(width: 52, alignment: .leading)

            ZStack(alignment: .bottom) {
                Rectangle()
                    .fill(PlannerTheme.line.opacity(0.85))
                    .frame(height: 1)
                    .padding(.bottom, 3)

                Text(value)
                    .font(.system(size: 24, weight: .medium, design: .serif))
                    .italic()
                    .foregroundStyle(PlannerTheme.ink)
                    .padding(.horizontal, 8)
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
                .font(.system(size: 9, weight: .medium))
                .tracking(1)
                .foregroundStyle(PlannerTheme.ink.opacity(0.85))

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
                            .foregroundStyle(PlannerTheme.ink.opacity(cell.inMonth ? 1 : 0.28))
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

private struct WeekPaperBackground: View {
    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let topSection = max(95, size.height * MonthWeekLayout.weekTopRatio)
            let rowHeight = max(1, (size.height - topSection) / 7)

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
            Spacer(minLength: 8)

            Text(formatWeekRange(week))
                .font(.system(size: 46, weight: .medium, design: .serif))
                .italic()
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .foregroundStyle(PlannerTheme.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .overlay(alignment: .top) {
                    Rectangle().fill(PlannerTheme.line).frame(height: 1)
                }
                .overlay(alignment: .bottom) {
                    Rectangle().fill(PlannerTheme.line).frame(height: 1)
                }

            WeekTabsView(weeks: calendar.weeks, activeIndex: weekIndex)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Color(hex: "#bcb3ad")).frame(height: 1)
                }

            Button {
                store.openSpread(.planning)
            } label: {
                Text("to do page")
                    .font(.system(size: 20, weight: .medium, design: .serif))
                    .italic()
                    .foregroundStyle(PlannerTheme.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 3)
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
                            .tracking(0.7)
                            .foregroundStyle(PlannerTheme.ink)
                            .padding(.leading, 10)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                }
            }
            .padding(.top, 1)
        }
        .overlay(alignment: .trailing) {
            MonthTabsView(includeNotesTab: true)
                .frame(width: 20)
                .padding(.trailing, 1)
                .padding(.vertical, 8)
        }
    }
}
