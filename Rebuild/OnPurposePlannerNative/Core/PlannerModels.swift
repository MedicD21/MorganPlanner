import Foundation

enum PlannerSpread: String, Codable, CaseIterable {
    case monthWeek
    case planning
    case notes
}

enum PlannerTool: String, Codable, CaseIterable, Identifiable {
    case pen
    case pencil
    case highlighter
    case eraser
    case bucket
    case shape
    case lasso
    case elements
    case text
    case image
    case sticky

    var id: String { rawValue }

    var label: String {
        switch self {
        case .pen: return "Pen"
        case .pencil: return "Pencil"
        case .highlighter: return "Highlighter"
        case .eraser: return "Eraser"
        case .bucket: return "Bucket"
        case .shape: return "Shape"
        case .lasso: return "Lasso"
        case .elements: return "Elements"
        case .text: return "Text"
        case .image: return "Image"
        case .sticky: return "Post-it"
        }
    }

    var supportsPencilKitDrawing: Bool {
        switch self {
        case .pen, .pencil, .highlighter, .eraser, .lasso:
            return true
        default:
            return false
        }
    }

    var isDrawingTool: Bool {
        switch self {
        case .pen, .pencil, .highlighter, .shape:
            return true
        default:
            return false
        }
    }

    var supportsColor: Bool {
        switch self {
        case .eraser, .lasso, .image:
            return false
        default:
            return true
        }
    }
}

enum InkTip: String, Codable, CaseIterable, Identifiable {
    case round
    case fine
    case fountain
    case marker
    case chisel

    var id: String { rawValue }
}

enum ShapeKind: String, Codable, CaseIterable, Identifiable {
    case line
    case rectangle
    case ellipse
    case triangle

    var id: String { rawValue }

    var label: String {
        switch self {
        case .line: return "Line"
        case .rectangle: return "Rect"
        case .ellipse: return "Oval"
        case .triangle: return "Tri"
        }
    }
}

enum ToolbarPosition: String, Codable {
    case side
    case top
}

enum PlannerPageKind: String, Codable {
    case month
    case week
    case planningLeft
    case planningRight
    case notesLeft
    case notesRight
}

struct PlannerPoint: Codable, Hashable {
    var x: Double
    var y: Double
}

struct PlannerRect: Codable, Hashable {
    var x: Double
    var y: Double
    var width: Double
    var height: Double
}

struct FavoriteStyle: Codable, Hashable, Identifiable {
    var id: String
    var tool: PlannerTool
    var colorHex: String
    var size: Double
    var tip: InkTip
}

struct PageFill: Codable, Hashable, Identifiable {
    var id: String
    var rect: PlannerRect
    var colorHex: String
    var opacity: Double
}

struct PageShape: Codable, Hashable, Identifiable {
    var id: String
    var kind: ShapeKind
    var start: PlannerPoint
    var end: PlannerPoint
    var colorHex: String
    var lineWidth: Double
    var opacity: Double
}

struct PageStamp: Codable, Hashable, Identifiable {
    var id: String
    var text: String
    var center: PlannerPoint
    var colorHex: String
    var fontSize: Double
}

struct PageImageStamp: Codable, Hashable, Identifiable {
    var id: String
    var center: PlannerPoint
    var width: Double
    var height: Double
    var opacity: Double
    var imageData: Data
}

struct StickyNoteModel: Codable, Hashable, Identifiable {
    var id: String
    var origin: PlannerPoint
    var width: Double
    var height: Double
    var collapsed: Bool
    var colorHex: String
    var text: String
}

struct PageContent: Codable, Hashable {
    var drawingData: Data
    var fills: [PageFill]
    var shapes: [PageShape]
    var stamps: [PageStamp]
    var images: [PageImageStamp]
    var stickies: [StickyNoteModel]

    init(
        drawingData: Data = Data(),
        fills: [PageFill] = [],
        shapes: [PageShape] = [],
        stamps: [PageStamp] = [],
        images: [PageImageStamp] = [],
        stickies: [StickyNoteModel] = []
    ) {
        self.drawingData = drawingData
        self.fills = fills
        self.shapes = shapes
        self.stamps = stamps
        self.images = images
        self.stickies = stickies
    }
}

enum PencilAction: String {
    case ignore
    case switchEraser
    case switchPrevious
    case showColorPalette
    case showInkAttributes
    case showContextualPalette
    case runSystemShortcut
    case unknown
}

enum PlannerDefaults {
    static let defaultColor = "#2f2b2a"
    static let defaultStrokeSize = 2.1
    static let minStroke: Double = 0.8
    static let maxStroke: Double = 4.8
    static let maxZoom: Double = 2.8
    static let minZoom: Double = 1.0
    static let favoriteColorLimit = 12
    static let favoriteStyleLimit = 8
    static let historyDepth = 160
    static let defaultPalette = [
        "#2f2b2a",
        "#1f3a64",
        "#0f6f67",
        "#0f8f43",
        "#a05f13",
        "#8d2525",
        "#7f3c9a",
        "#5f5f63"
    ]
    static let symbolOptions = ["", "✓", "★", "•", "→", "♥"]
    static let quickSlots: [PlannerTool] = [.pen, .pencil, .highlighter, .eraser]
}
