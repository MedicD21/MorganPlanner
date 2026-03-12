import SwiftUI

struct PageInteractionLayer: View {
    @EnvironmentObject private var store: PlannerStore
    let pageID: String
    let pageKind: PlannerPageKind

    @State private var dragStart: CGPoint?
    @State private var dragCurrent: CGPoint?

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            ZStack {
                if let start = dragStart, let current = dragCurrent, store.activeTool == .shape {
                    ShapePreviewOverlay(
                        kind: store.shapeKind,
                        start: start,
                        end: current,
                        colorHex: store.activeColorHex,
                        width: store.effectiveLineWidth,
                        opacity: store.effectiveOpacity
                    )
                    .allowsHitTesting(false)
                }

                Rectangle()
                    .fill(Color.clear)
                    .contentShape(Rectangle())
                    .gesture(interactionGesture(size: size))
            }
        }
        .allowsHitTesting(interactionEnabled)
    }

    private var interactionEnabled: Bool {
        !store.activeTool.supportsPencilKitDrawing
    }

    private func interactionGesture(size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                store.setActivePage(pageID)
                if dragStart == nil {
                    dragStart = value.startLocation
                }
                dragCurrent = value.location
            }
            .onEnded { value in
                defer {
                    dragStart = nil
                    dragCurrent = nil
                }

                let startPoint = dragStart ?? value.startLocation
                let endPoint = value.location
                let startNormalized = pointToNormalized(startPoint, in: size)
                let endNormalized = pointToNormalized(endPoint, in: size)
                let distance = hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y)

                switch store.activeTool {
                case .bucket:
                    let cells = bucketFillRects(for: pageKind, in: size)
                    guard let target = cells.first(where: { $0.contains(startPoint) }) else { return }
                    store.addFill(
                        pageID: pageID,
                        rect: rectToNormalized(target, in: size),
                        colorHex: store.activeColorHex,
                        opacity: 0.28
                    )

                case .shape:
                    guard distance > 5 else { return }
                    store.addShape(
                        pageID: pageID,
                        kind: store.shapeKind,
                        start: startNormalized,
                        end: endNormalized
                    )

                case .elements:
                    let value = store.activeSymbol.isEmpty ? "✓" : store.activeSymbol
                    store.addStamp(pageID: pageID, text: value, center: startNormalized)

                case .text:
                    let value = store.textStamp.trimmingCharacters(in: .whitespacesAndNewlines)
                    store.addStamp(pageID: pageID, text: value.isEmpty ? "note" : value, center: startNormalized)

                case .image:
                    store.addImageStamp(pageID: pageID, center: startNormalized)

                case .sticky:
                    store.addSticky(pageID: pageID, origin: startNormalized)

                default:
                    break
                }
            }
    }
}

private struct ShapePreviewOverlay: View {
    let kind: ShapeKind
    let start: CGPoint
    let end: CGPoint
    let colorHex: String
    let width: Double
    let opacity: Double

    var body: some View {
        Canvas { context, _ in
            let stroke = StrokeStyle(lineWidth: max(1, width), lineCap: .round, lineJoin: .round)
            let color = Color(hex: colorHex).opacity(opacity * 0.75)

            switch kind {
            case .line:
                var path = Path()
                path.move(to: start)
                path.addLine(to: end)
                context.stroke(path, with: .color(color), style: stroke)

            case .rectangle:
                let rect = CGRect(
                    x: min(start.x, end.x),
                    y: min(start.y, end.y),
                    width: abs(end.x - start.x),
                    height: abs(end.y - start.y)
                )
                context.stroke(Path(rect), with: .color(color), style: stroke)

            case .ellipse:
                let rect = CGRect(
                    x: min(start.x, end.x),
                    y: min(start.y, end.y),
                    width: abs(end.x - start.x),
                    height: abs(end.y - start.y)
                )
                context.stroke(Path(ellipseIn: rect), with: .color(color), style: stroke)

            case .triangle:
                let minX = min(start.x, end.x)
                let maxX = max(start.x, end.x)
                let minY = min(start.y, end.y)
                let maxY = max(start.y, end.y)
                var path = Path()
                path.move(to: CGPoint(x: (minX + maxX) / 2, y: minY))
                path.addLine(to: CGPoint(x: minX, y: maxY))
                path.addLine(to: CGPoint(x: maxX, y: maxY))
                path.closeSubpath()
                context.stroke(path, with: .color(color), style: stroke)
            }
        }
    }
}

private func bucketFillRects(for kind: PlannerPageKind, in size: CGSize) -> [CGRect] {
    switch kind {
    case .month:
        let headerHeight = size.height * 0.30
        let weekdayHeight = size.height * 0.055
        let gridTop = headerHeight + weekdayHeight
        let gridHeight = max(0, size.height - gridTop)
        let cellWidth = size.width / 7
        let cellHeight = gridHeight / 6
        var rects: [CGRect] = []
        for row in 0..<6 {
            for col in 0..<7 {
                rects.append(
                    CGRect(
                        x: CGFloat(col) * cellWidth,
                        y: gridTop + CGFloat(row) * cellHeight,
                        width: cellWidth,
                        height: cellHeight
                    )
                )
            }
        }
        return rects

    case .week:
        let top = size.height * 0.24
        let rowHeight = max(1, (size.height - top) / 7)
        return (0..<7).map { index in
            CGRect(
                x: 0,
                y: top + CGFloat(index) * rowHeight,
                width: size.width,
                height: rowHeight
            )
        }

    case .planningLeft:
        let top = size.height * 0.1
        let bodyHeight = max(0, size.height - top)
        let leftWidth = size.width * 0.635
        let rowHeight = bodyHeight / 7
        var rects = (0..<7).map { index in
            CGRect(
                x: 0,
                y: top + CGFloat(index) * rowHeight,
                width: leftWidth,
                height: rowHeight
            )
        }
        rects.append(
            CGRect(
                x: leftWidth,
                y: top,
                width: size.width - leftWidth,
                height: bodyHeight
            )
        )
        return rects

    case .planningRight:
        let top: CGFloat = 0
        return [
            CGRect(
                x: size.width * 0.5,
                y: top,
                width: size.width * 0.5,
                height: size.height
            )
        ]

    case .notesLeft:
        let top = size.height * 0.09
        let lineHeight = max(1, (size.height - top) / 24)
        return (0..<24).map { index in
            CGRect(
                x: 0,
                y: top + CGFloat(index) * lineHeight,
                width: size.width,
                height: lineHeight
            )
        }

    case .notesRight:
        let top = size.height * 0.09
        return [CGRect(x: 0, y: top, width: size.width, height: size.height - top)]
    }
}
