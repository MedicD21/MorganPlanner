import SwiftUI
import PencilKit

struct InkCanvasView: UIViewRepresentable {
    @EnvironmentObject private var store: PlannerStore
    let pageID: String

    func makeCoordinator() -> Coordinator {
        Coordinator(store: store, pageID: pageID)
    }

    func makeUIView(context: Context) -> TrackingCanvasView {
        let canvas = TrackingCanvasView(frame: .zero)
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.delegate = context.coordinator
        canvas.drawingPolicy = .pencilOnly
        canvas.onInteractionStart = { [weak coordinator = context.coordinator] in
            coordinator?.store.setActivePage(coordinator?.pageID ?? "")
        }
        context.coordinator.canvasView = canvas
        context.coordinator.applyExternalDrawingIfNeeded(from: store.pageContent(for: pageID).drawingData)
        return canvas
    }

    func updateUIView(_ uiView: TrackingCanvasView, context: Context) {
        context.coordinator.store = store
        context.coordinator.pageID = pageID
        uiView.onInteractionStart = { [weak coordinator = context.coordinator] in
            coordinator?.store.setActivePage(coordinator?.pageID ?? "")
        }

        uiView.isUserInteractionEnabled = store.activeTool.supportsPencilKitDrawing
        uiView.drawingPolicy = store.allowFingerDrawing ? .anyInput : .pencilOnly
        uiView.tool = context.coordinator.currentTool(
            tool: store.activeTool,
            colorHex: store.activeColorHex,
            strokeSize: store.strokeSize,
            tip: store.activeTip
        )
        context.coordinator.applyExternalDrawingIfNeeded(from: store.pageContent(for: pageID).drawingData)
    }

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        var store: PlannerStore
        var pageID: String
        weak var canvasView: PKCanvasView?

        private var isApplyingExternalDrawing = false
        private var lastCommittedDrawingData: Data = Data()
        private var lastUndoPushTimestamp: TimeInterval = 0

        init(store: PlannerStore, pageID: String) {
            self.store = store
            self.pageID = pageID
        }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            if isApplyingExternalDrawing {
                return
            }

            let drawingData = canvasView.drawing.dataRepresentation()
            if drawingData == lastCommittedDrawingData {
                return
            }

            let now = CACurrentMediaTime()
            let shouldRecordUndo = now - lastUndoPushTimestamp > 0.45
            if shouldRecordUndo {
                lastUndoPushTimestamp = now
            }
            lastCommittedDrawingData = drawingData
            store.setDrawingData(drawingData, for: pageID, recordUndo: shouldRecordUndo)
        }

        func applyExternalDrawingIfNeeded(from data: Data) {
            guard let canvasView else { return }
            if data == lastCommittedDrawingData {
                return
            }

            let drawing: PKDrawing
            if data.isEmpty {
                drawing = PKDrawing()
            } else {
                drawing = (try? PKDrawing(data: data)) ?? PKDrawing()
            }

            isApplyingExternalDrawing = true
            canvasView.drawing = drawing
            isApplyingExternalDrawing = false
            lastCommittedDrawingData = canvasView.drawing.dataRepresentation()
        }

        func currentTool(tool: PlannerTool, colorHex: String, strokeSize: Double, tip: InkTip) -> PKTool {
            let uiColor = UIColor(hex: colorHex) ?? UIColor.label
            let baseWidth = max(PlannerDefaults.minStroke, min(strokeSize, PlannerDefaults.maxStroke))
            let tipAdjustedWidth = baseWidth * tipWidthMultiplier(tip)

            switch tool {
            case .pen:
                return PKInkingTool(.pen, color: uiColor, width: tipAdjustedWidth)
            case .pencil:
                return PKInkingTool(.pencil, color: uiColor.withAlphaComponent(0.75), width: tipAdjustedWidth * 0.9)
            case .highlighter:
                return PKInkingTool(.marker, color: uiColor.withAlphaComponent(0.28), width: tipAdjustedWidth * 2.3)
            case .eraser:
                return PKEraserTool(.bitmap)
            case .lasso:
                if #available(iOS 17.0, *) {
                    return PKLassoTool()
                }
                return PKEraserTool(.vector)
            default:
                return PKInkingTool(.pen, color: uiColor, width: tipAdjustedWidth)
            }
        }

        private func tipWidthMultiplier(_ tip: InkTip) -> Double {
            switch tip {
            case .round:
                return 1
            case .fine:
                return 0.74
            case .fountain:
                return 1.08
            case .marker:
                return 1.35
            case .chisel:
                return 1.22
            }
        }
    }
}

final class TrackingCanvasView: PKCanvasView {
    var onInteractionStart: (() -> Void)?

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        onInteractionStart?()
        super.touchesBegan(touches, with: event)
    }
}
