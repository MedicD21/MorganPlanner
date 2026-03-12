import SwiftUI

struct PlannerStageView: View {
    @EnvironmentObject private var store: PlannerStore
    let spreadSize: CGSize

    @State private var liveScaleMultiplier: Double = 1
    @State private var liveDragOffset: CGSize = .zero

    var body: some View {
        ZStack {
            spreadContent
                .frame(width: spreadSize.width, height: spreadSize.height)
                .scaleEffect(store.zoomScale * liveScaleMultiplier)
                .offset(
                    x: store.zoomOffset.width + liveDragOffset.width,
                    y: store.zoomOffset.height + liveDragOffset.height
                )
                .simultaneousGesture(magnifyGesture)
                .simultaneousGesture(panGesture)
                .overlay(
                    ThreeFingerUndoGestureBridge {
                        store.undoActivePage()
                    }
                )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private var spreadContent: some View {
        switch store.activeSpread {
        case .monthWeek:
            MonthWeekSpreadView()
        case .planning:
            PlanningSpreadView()
        case .notes:
            NotesSpreadView()
        }
    }

    private var magnifyGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                liveScaleMultiplier = value
            }
            .onEnded { value in
                store.commitZoom(
                    scaleMultiplier: value,
                    additionalOffset: liveDragOffset,
                    spreadSize: spreadSize
                )
                liveScaleMultiplier = 1
                liveDragOffset = .zero
            }
    }

    private var panGesture: some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .local)
            .onChanged { value in
                if (store.zoomScale * liveScaleMultiplier) > 1.01 {
                    liveDragOffset = value.translation
                }
            }
            .onEnded { value in
                if (store.zoomScale * liveScaleMultiplier) > 1.01 {
                    store.commitPan(translation: value.translation, spreadSize: spreadSize)
                }
                liveDragOffset = .zero
            }
    }
}
