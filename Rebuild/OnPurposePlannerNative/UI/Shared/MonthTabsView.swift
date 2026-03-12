import SwiftUI

struct MonthTabsView: View {
    @EnvironmentObject private var store: PlannerStore
    var includeNotesTab: Bool = true

    private let tabGap: CGFloat = 2

    var body: some View {
        GeometryReader { proxy in
            let count = includeNotesTab ? 13 : 12
            let totalGap = tabGap * CGFloat(max(0, count - 1))
            let tabHeight = max(12, (proxy.size.height - totalGap) / CGFloat(count))

            VStack(spacing: tabGap) {
                ForEach(Array(monthNames.enumerated()), id: \.offset) { index, name in
                    monthButton(
                        monthValue: index + 1,
                        label: String(name.prefix(3)).uppercased(),
                        height: tabHeight
                    )
                }

                if includeNotesTab {
                    notesButton(height: tabHeight)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        }
        .padding(.vertical, 6)
        .padding(.trailing, 1)
    }

    private func monthButton(monthValue: Int, label: String, height: CGFloat) -> some View {
        let active = monthValue == store.month && store.activeSpread != .notes
        return Button {
            store.setMonth(monthValue)
            store.openSpread(.monthWeek)
        } label: {
            Text(verticalLabel(label))
                .font(.system(size: 8, weight: .bold, design: .serif))
                .tracking(0.4)
                .multilineTextAlignment(.center)
                .foregroundStyle(PlannerTheme.ink)
                .lineSpacing(-1)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(RightEdgeTabShape(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .frame(width: 17, height: height)
        .background(
            RightEdgeTabShape(cornerRadius: 8)
                .fill(active ? Color(hex: "#969492") : PlannerTheme.tab)
        )
        .overlay(
            RightEdgeTabShape(cornerRadius: 8)
                .stroke(Color(hex: "#b8b0a8"), lineWidth: 1)
        )
    }

    private func notesButton(height: CGFloat) -> some View {
        let active = store.activeSpread == .notes
        return Button {
            store.openSpread(.notes)
        } label: {
            Text(verticalLabel("NOTES"))
                .font(.system(size: 7.5, weight: .bold, design: .serif))
                .tracking(0.35)
                .multilineTextAlignment(.center)
                .foregroundStyle(PlannerTheme.ink)
                .lineSpacing(-1)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(RightEdgeTabShape(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .frame(width: 17, height: height)
        .background(
            RightEdgeTabShape(cornerRadius: 8)
                .fill(active ? Color(hex: "#969492") : PlannerTheme.tab)
        )
        .overlay(
            RightEdgeTabShape(cornerRadius: 8)
                .stroke(Color(hex: "#b8b0a8"), lineWidth: 1)
        )
    }

    private func verticalLabel(_ text: String) -> String {
        text.map(String.init).joined(separator: "\n")
    }
}

private struct RightEdgeTabShape: Shape {
    let cornerRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        let radius = min(cornerRadius, rect.height / 2, rect.width / 2)

        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY + radius),
            control: CGPoint(x: rect.maxX, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - radius, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
