import SwiftUI

struct SpreadScaffoldView<Left: View, Right: View>: View {
    let leftRatio: CGFloat
    let rightRatio: CGFloat
    @ViewBuilder let left: () -> Left
    @ViewBuilder let right: () -> Right

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 2)
                .fill(PlannerTheme.cover)

            GeometryReader { proxy in
                let width = proxy.size.width
                let height = proxy.size.height
                let total = leftRatio + rightRatio
                let leftWidth = width * (leftRatio / total)
                let rightWidth = width - leftWidth

                HStack(spacing: 0) {
                    left()
                        .frame(width: leftWidth, height: height)
                        .background(PlannerTheme.paper)
                        .overlay(alignment: .trailing) {
                            Rectangle()
                                .fill(Color(hex: "#bcb3ad"))
                                .frame(width: 1)
                        }
                    right()
                        .frame(width: rightWidth, height: height)
                        .background(PlannerTheme.paper)
                }
            }
            .padding(7)
        }
        .overlay(
            RoundedRectangle(cornerRadius: 2)
                .stroke(Color(hex: "#25181c"), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.35), radius: 24, x: 0, y: 18)
    }
}
