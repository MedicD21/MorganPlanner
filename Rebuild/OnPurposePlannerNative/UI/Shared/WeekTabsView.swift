import SwiftUI

struct WeekTabsView: View {
    @EnvironmentObject private var store: PlannerStore
    let weeks: [[PlannerCalendarCell]]
    let activeIndex: Int

    var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(weeks.enumerated()), id: \.offset) { index, week in
                Button {
                    store.setWeek(index)
                } label: {
                    Text(weekTabLabel(week))
                        .font(.system(size: 10, weight: .medium, design: .default))
                        .lineLimit(1)
                        .foregroundStyle(PlannerTheme.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 3)
                }
                .buttonStyle(.plain)
                .background(
                    Capsule(style: .continuous)
                        .fill(index == activeIndex ? Color.white : Color(hex: "#f3eee8"))
                )
                .overlay(
                    Capsule(style: .continuous)
                        .stroke(index == activeIndex ? Color(hex: "#8f847c") : Color(hex: "#b8b0a8"), lineWidth: 1)
                )
            }
        }
    }
}
