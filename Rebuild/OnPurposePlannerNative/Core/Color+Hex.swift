import SwiftUI
import UIKit

extension UIColor {
    convenience init?(hex: String) {
        var normalized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized.hasPrefix("#") {
            normalized.removeFirst()
        }
        guard normalized.count == 6, let rgb = Int(normalized, radix: 16) else {
            return nil
        }

        let red = CGFloat((rgb >> 16) & 0xFF) / 255
        let green = CGFloat((rgb >> 8) & 0xFF) / 255
        let blue = CGFloat(rgb & 0xFF) / 255

        self.init(red: red, green: green, blue: blue, alpha: 1)
    }

    var hexString: String {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return String(
            format: "#%02x%02x%02x",
            Int(red * 255),
            Int(green * 255),
            Int(blue * 255)
        )
    }
}

extension Color {
    init(hex: String, fallback: Color = .black) {
        if let ui = UIColor(hex: hex) {
            self = Color(uiColor: ui)
        } else {
            self = fallback
        }
    }
}

func isValidHexColor(_ value: String) -> Bool {
    let pattern = "^#[0-9a-fA-F]{6}$"
    return value.range(of: pattern, options: .regularExpression) != nil
}
