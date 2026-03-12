import SwiftUI

struct DotGridBackground: View {
    var body: some View {
        Canvas { context, size in
            let spacing: CGFloat = 22
            let radius: CGFloat = 0.9
            for x in stride(from: 10, through: size.width, by: spacing) {
                for y in stride(from: 10, through: size.height, by: spacing) {
                    let rect = CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)
                    context.fill(Path(ellipseIn: rect), with: .color(PlannerTheme.dot))
                }
            }
        }
    }
}
