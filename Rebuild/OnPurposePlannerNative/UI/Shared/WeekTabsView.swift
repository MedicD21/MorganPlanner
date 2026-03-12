import SwiftUI

struct WeekTabsView: View {
    @EnvironmentObject private var store: PlannerStore
    let weeks: [[PlannerCalendarCell]]
    let activeIndex: Int

    var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(weeks.enumerated()), id: \.offset) { index, week in
                let active = index == activeIndex

                Button {
                    store.setWeek(index)
                } label: {
                    Text(weekTabLabel(week))
                        .font(.system(size: 10, weight: active ? .semibold : .regular))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .foregroundStyle(PlannerTheme.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 3)
                        .contentShape(Capsule(style: .continuous))
                }
                .buttonStyle(.plain)
                .background(
                    Capsule(style: .continuous)
                        .fill(active ? Color.white : Color(hex: "#f3eee8"))
                )
                .overlay(
                    Capsule(style: .continuous)
                        .stroke(active ? Color(hex: "#8f847c") : Color(hex: "#b8b0a8"), lineWidth: 1)
                )
            }
        }
    }
}
