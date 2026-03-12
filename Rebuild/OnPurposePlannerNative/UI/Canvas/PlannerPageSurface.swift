import SwiftUI

struct PlannerPageSurface<Background: View>: View {
    @EnvironmentObject private var store: PlannerStore
    let pageID: String
    let pageKind: PlannerPageKind
    @ViewBuilder let background: () -> Background

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let page = store.pageContent(for: pageID)

            ZStack(alignment: .topLeading) {
                background()

                fillLayer(page.fills, size: size)
                shapeLayer(page.shapes, size: size)
                InkCanvasView(pageID: pageID)
                    .environmentObject(store)

                stampLayer(page.stamps, size: size)
                imageLayer(page.images, size: size)

                ForEach(page.stickies) { sticky in
                    StickyNoteView(
                        sticky: sticky,
                        pageID: pageID,
                        pageSize: size
                    )
                }

                PageInteractionLayer(pageID: pageID, pageKind: pageKind)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                store.setActivePage(pageID)
            }
            .onAppear {
                if store.activePageID == nil {
                    store.setActivePage(pageID)
                }
            }
        }
        .clipped()
    }

    @ViewBuilder
    private func fillLayer(_ fills: [PageFill], size: CGSize) -> some View {
        ForEach(fills) { fill in
            let rect = normalizedRect(fill.rect, in: size)
            Rectangle()
                .fill(Color(hex: fill.colorHex).opacity(fill.opacity))
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
                .allowsHitTesting(false)
        }
    }

    @ViewBuilder
    private func shapeLayer(_ shapes: [PageShape], size: CGSize) -> some View {
        ForEach(shapes) { shape in
            ShapeOverlay(shape: shape, size: size)
                .allowsHitTesting(false)
        }
    }

    @ViewBuilder
    private func stampLayer(_ stamps: [PageStamp], size: CGSize) -> some View {
        ForEach(stamps) { stamp in
            let point = normalizedPoint(stamp.center, in: size)
            Text(stamp.text)
                .font(.system(size: max(12, stamp.fontSize), weight: .semibold, design: .default))
                .foregroundStyle(Color(hex: stamp.colorHex))
                .position(point)
                .allowsHitTesting(false)
        }
    }

    @ViewBuilder
    private func imageLayer(_ images: [PageImageStamp], size: CGSize) -> some View {
        ForEach(images) { image in
            if let uiImage = UIImage(data: image.imageData) {
                let point = normalizedPoint(image.center, in: size)
                let width = CGFloat(image.width) * size.width
                let height = CGFloat(image.height) * size.height
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .frame(width: width, height: height)
                    .opacity(image.opacity)
                    .position(point)
                    .allowsHitTesting(false)
            }
        }
    }
}

private struct ShapeOverlay: View {
    let shape: PageShape
    let size: CGSize

    var body: some View {
        Canvas { context, _ in
            let start = normalizedPoint(shape.start, in: size)
            let end = normalizedPoint(shape.end, in: size)
            let stroke = StrokeStyle(lineWidth: max(1, shape.lineWidth), lineCap: .round, lineJoin: .round)
            let color = Color(hex: shape.colorHex).opacity(shape.opacity)

            switch shape.kind {
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
                var path = Path()
                let minX = min(start.x, end.x)
                let maxX = max(start.x, end.x)
                let minY = min(start.y, end.y)
                let maxY = max(start.y, end.y)
                path.move(to: CGPoint(x: (minX + maxX) / 2, y: minY))
                path.addLine(to: CGPoint(x: minX, y: maxY))
                path.addLine(to: CGPoint(x: maxX, y: maxY))
                path.closeSubpath()
                context.stroke(path, with: .color(color), style: stroke)
            }
        }
    }
}

func normalizedPoint(_ point: PlannerPoint, in size: CGSize) -> CGPoint {
    CGPoint(
        x: CGFloat(point.x) * size.width,
        y: CGFloat(point.y) * size.height
    )
}

func normalizedRect(_ rect: PlannerRect, in size: CGSize) -> CGRect {
    CGRect(
        x: CGFloat(rect.x) * size.width,
        y: CGFloat(rect.y) * size.height,
        width: CGFloat(rect.width) * size.width,
        height: CGFloat(rect.height) * size.height
    )
}

func pointToNormalized(_ point: CGPoint, in size: CGSize) -> PlannerPoint {
    let safeWidth = max(size.width, 1)
    let safeHeight = max(size.height, 1)
    let x = min(max(point.x / safeWidth, 0), 1)
    let y = min(max(point.y / safeHeight, 0), 1)
    return PlannerPoint(x: x, y: y)
}

func rectToNormalized(_ rect: CGRect, in size: CGSize) -> PlannerRect {
    let safeWidth = max(size.width, 1)
    let safeHeight = max(size.height, 1)
    return PlannerRect(
        x: min(max(rect.origin.x / safeWidth, 0), 1),
        y: min(max(rect.origin.y / safeHeight, 0), 1),
        width: min(max(rect.width / safeWidth, 0), 1),
        height: min(max(rect.height / safeHeight, 0), 1)
    )
}
