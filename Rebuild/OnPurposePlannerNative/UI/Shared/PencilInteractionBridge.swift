import SwiftUI
import UIKit

struct PencilInteractionBridge: UIViewRepresentable {
    @ObservedObject var store: PlannerStore

    func makeCoordinator() -> Coordinator {
        Coordinator(store: store)
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .clear
        context.coordinator.attachIfNeeded(to: view)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.store = store
        context.coordinator.attachIfNeeded(to: uiView)
    }

    final class Coordinator: NSObject, UIPencilInteractionDelegate {
        var store: PlannerStore
        private weak var hostView: UIView?
        private var interaction: UIPencilInteraction?

        init(store: PlannerStore) {
            self.store = store
        }

        func attachIfNeeded(to view: UIView) {
            guard interaction == nil else { return }
            let pencilInteraction = UIPencilInteraction()
            pencilInteraction.delegate = self
            pencilInteraction.isEnabled = true
            view.addInteraction(pencilInteraction)
            interaction = pencilInteraction
            hostView = view
        }

        func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
            handlePreferredAction(UIPencilInteraction.preferredTapAction)
        }

        @available(iOS 17.5, *)
        func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
            handlePreferredAction(UIPencilInteraction.preferredTapAction)
        }

        @available(iOS 17.5, *)
        func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
            if squeeze.phase == .began || squeeze.phase == .changed {
                return
            }
            handlePreferredAction(UIPencilInteraction.preferredSqueezeAction)
        }

        private func handlePreferredAction(_ action: UIPencilPreferredAction) {
            let mapped = mapAction(action)
            Task { @MainActor [store] in
                store.handlePencilAction(mapped)
            }
        }

        private func mapAction(_ action: UIPencilPreferredAction) -> PencilAction {
            if #available(iOS 17.5, *) {
                if action == .showContextualPalette {
                    return .showContextualPalette
                }
                if action == .runSystemShortcut {
                    return .runSystemShortcut
                }
            }

            if #available(iOS 16.0, *) {
                if action == .showInkAttributes {
                    return .showInkAttributes
                }
            }

            switch action {
            case .ignore:
                return .ignore
            case .switchEraser:
                return .switchEraser
            case .switchPrevious:
                return .switchPrevious
            case .showColorPalette:
                return .showColorPalette
            default:
                return .unknown
            }
        }
    }
}
