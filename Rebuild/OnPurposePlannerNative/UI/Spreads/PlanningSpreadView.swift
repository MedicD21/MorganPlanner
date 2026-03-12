import SwiftUI

struct PlanningSpreadView: View {
    @EnvironmentObject private var store: PlannerStore

    var body: some View {
        SpreadScaffoldView(leftRatio: 1, rightRatio: 1.65) {
            PlannerPageSurface(pageID: store.planningLeftPageID, pageKind: .planningLeft) {
                PlanningLeftPaperBackground()
            }
        } right: {
            ZStack(alignment: .topTrailing) {
                PlannerPageSurface(pageID: store.planningRightPageID, pageKind: .planningRight) {
                    PlanningRightPaperBackground()
                }
                MonthTabsView(includeNotesTab: true)
                    .frame(width: 24)
                    .padding(.trailing, 1)
                    .padding(.vertical, 8)
            }
        }
    }
}

private struct PlanningLeftPaperBackground: View {
    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let topHeight = size.height * 0.1
            let leftWidth = size.width * 0.635
            let rowHeight = max(1, (size.height - topHeight) / 7)

            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    Text("to do today")
                        .font(.system(size: 24, weight: .medium, design: .serif))
                        .italic()
                        .frame(maxWidth: .infinity)
                    Text("this week")
                        .font(.system(size: 24, weight: .medium, design: .serif))
                        .italic()
                        .frame(width: size.width - leftWidth)
                }
                .frame(height: topHeight)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(PlannerTheme.line).frame(height: 1)
                }

                HStack(spacing: 0) {
                    VStack(spacing: 0) {
                        ForEach(Array(weekdayInitials.enumerated()), id: \.offset) { _, day in
                            HStack {
                                Text(day)
                                    .font(.system(size: 16, weight: .regular))
                                    .padding(.leading, 9)
                                Spacer()
                            }
                            .frame(height: rowHeight)
                            .overlay(alignment: .bottom) {
                                Rectangle().fill(PlannerTheme.line).frame(height: 1)
                            }
                        }
                    }
                    .frame(width: leftWidth)
                    .overlay(alignment: .trailing) {
                        Rectangle().fill(PlannerTheme.line).frame(width: 1)
                    }

                    Rectangle()
                        .fill(Color.clear)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
    }
}

private struct PlanningRightPaperBackground: View {
    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let rightX = size.width * 0.5

            HStack(spacing: 0) {
                Rectangle()
                    .fill(PlannerTheme.paper)
                    .overlay(
                        DotGridBackground()
                            .opacity(0.9)
                    )
                    .overlay(alignment: .trailing) {
                        Rectangle().fill(PlannerTheme.line).frame(width: 1)
                    }

                VStack(spacing: 0) {
                    Text("to do this month")
                        .font(.system(size: 27, weight: .semibold, design: .serif))
                        .italic()
                        .padding(.top, 10)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(width: size.width, height: size.height)
            .overlay(
                Rectangle()
                    .fill(Color.clear)
                    .frame(width: rightX)
                    .overlay(alignment: .bottom) {
                        Rectangle()
                            .fill(PlannerTheme.hairline)
                            .frame(height: 1)
                    },
                alignment: .leading
            )
        }
    }
}
