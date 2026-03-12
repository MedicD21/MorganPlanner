import SwiftUI

enum PlannerTheme {
    static let ink = Color(hex: "#2d2928")
    static let paper = Color(hex: "#fbfaf7")
    static let line = Color(hex: "#9f9a94")
    static let hairline = Color(hex: "#d2cdc5")
    static let dot = Color(hex: "#cfc8bf")
    static let cover = Color(hex: "#412f33")
    static let tab = Color(hex: "#f3eee8")
    static let accent = Color(hex: "#8f5e6b")

    static let appGradient = LinearGradient(
        colors: [
            Color(hex: "#8f5e6b"),
            Color(hex: "#8e5f6c"),
            Color(hex: "#744756")
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}
