import SwiftUI
import UIKit

struct ThreeFingerUndoGestureBridge: UIViewRepresentable {
    let onUndo: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onUndo: onUndo)
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = true

        let recognizer = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleDoubleTap))
        recognizer.numberOfTouchesRequired = 3
        recognizer.numberOfTapsRequired = 2
        recognizer.cancelsTouchesInView = false
        view.addGestureRecognizer(recognizer)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onUndo = onUndo
    }

    final class Coordinator: NSObject {
        var onUndo: () -> Void

        init(onUndo: @escaping () -> Void) {
            self.onUndo = onUndo
        }

        @objc func handleDoubleTap() {
            onUndo()
        }
    }
}
