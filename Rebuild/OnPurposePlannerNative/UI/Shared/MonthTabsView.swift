import SwiftUI

struct MonthTabsView: View {
    @EnvironmentObject private var store: PlannerStore
    var includeNotesTab: Bool = true

    var body: some View {
        VStack(spacing: 2) {
            ForEach(Array(monthNames.enumerated()), id: \.offset) { index, name in
                let monthValue = index + 1
                Button {
                    store.setMonth(monthValue)
                    store.openSpread(.monthWeek)
                } label: {
                    Text(String(name.prefix(3)).uppercased())
                        .font(.system(size: 10, weight: .bold, design: .serif))
                        .foregroundStyle(PlannerTheme.ink)
                        .rotationEffect(.degrees(180))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .frame(width: 18)
                .buttonStyle(.plain)
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(monthValue == store.month ? Color(hex: "#969492") : PlannerTheme.tab)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .stroke(Color(hex: "#b8b0a8"), lineWidth: 1)
                )
            }

            if includeNotesTab {
                Button {
                    store.openSpread(.notes)
                } label: {
                    Text("NOTES")
                        .font(.system(size: 10, weight: .bold, design: .serif))
                        .foregroundStyle(PlannerTheme.ink)
                        .rotationEffect(.degrees(180))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .frame(width: 18)
                .buttonStyle(.plain)
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(store.activeSpread == .notes ? Color(hex: "#969492") : PlannerTheme.tab)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .stroke(Color(hex: "#b8b0a8"), lineWidth: 1)
                )
            }
        }
        .padding(.vertical, 6)
        .padding(.trailing, 2)
    }
}
