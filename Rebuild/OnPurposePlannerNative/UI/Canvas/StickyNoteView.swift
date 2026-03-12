import SwiftUI

struct StickyNoteView: View {
    @EnvironmentObject private var store: PlannerStore
    let sticky: StickyNoteModel
    let pageID: String
    let pageSize: CGSize

    @State private var dragStartOrigin: PlannerPoint?

    var body: some View {
        let expandedWidth = max(120, CGFloat(sticky.width) * pageSize.width)
        let expandedHeight = max(96, CGFloat(sticky.height) * pageSize.height)
        let collapsedSize: CGFloat = 30
        let renderWidth = sticky.collapsed ? collapsedSize : expandedWidth
        let renderHeight = sticky.collapsed ? collapsedSize : expandedHeight
        let origin = normalizedPoint(sticky.origin, in: pageSize)

        Group {
            if sticky.collapsed {
                collapsedSticky
            } else {
                expandedSticky
            }
        }
        .frame(width: renderWidth, height: renderHeight)
        .position(
            x: origin.x + renderWidth / 2,
            y: origin.y + renderHeight / 2
        )
        .highPriorityGesture(dragGesture(width: renderWidth, height: renderHeight))
    }

    private var collapsedSticky: some View {
        Button {
            store.toggleStickyCollapsed(pageID: pageID, stickyID: sticky.id)
        } label: {
            Text("note")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(Color(hex: "#5e4b25"))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color(hex: sticky.colorHex))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(Color(hex: "#c5ab68"), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private var expandedSticky: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                Spacer(minLength: 0)
                Button {
                    store.toggleStickyCollapsed(pageID: pageID, stickyID: sticky.id)
                } label: {
                    Image(systemName: "minus")
                        .font(.system(size: 10, weight: .bold))
                        .frame(width: 17, height: 17)
                        .background(Color.white.opacity(0.7), in: RoundedRectangle(cornerRadius: 4))
                }
                .buttonStyle(.plain)

                Button {
                    store.deleteSticky(pageID: pageID, stickyID: sticky.id)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .bold))
                        .frame(width: 17, height: 17)
                        .background(Color.white.opacity(0.7), in: RoundedRectangle(cornerRadius: 4))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 5)
            .padding(.top, 4)
            .padding(.bottom, 3)
            .background(Color(hex: "#fceaA1".lowercased()))

            TextEditor(
                text: Binding(
                    get: { sticky.text },
                    set: { value in
                        store.updateStickyText(pageID: pageID, stickyID: sticky.id, text: value)
                    }
                )
            )
            .font(.system(size: 13, weight: .regular, design: .rounded))
            .scrollContentBackground(.hidden)
            .padding(.horizontal, 6)
            .padding(.bottom, 4)
            .background(Color.clear)
        }
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color(hex: sticky.colorHex))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color(hex: "#d0b977"), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.2), radius: 8, x: 0, y: 5)
    }

    private func dragGesture(width: CGFloat, height: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .local)
            .onChanged { value in
                if dragStartOrigin == nil {
                    dragStartOrigin = sticky.origin
                }
                guard let start = dragStartOrigin else { return }
                let startPoint = normalizedPoint(start, in: pageSize)
                let nextX = min(max(startPoint.x + value.translation.width, 0), max(0, pageSize.width - width))
                let nextY = min(max(startPoint.y + value.translation.height, 0), max(0, pageSize.height - height))
                let normalized = pointToNormalized(CGPoint(x: nextX, y: nextY), in: pageSize)
                store.moveSticky(pageID: pageID, stickyID: sticky.id, origin: normalized)
                store.setActivePage(pageID)
            }
            .onEnded { _ in
                dragStartOrigin = nil
            }
    }
}
