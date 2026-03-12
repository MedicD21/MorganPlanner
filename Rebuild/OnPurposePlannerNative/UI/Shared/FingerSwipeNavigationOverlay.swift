import SwiftUI
import UIKit

struct FingerSwipeNavigationOverlay: UIViewRepresentable {
    enum Axis {
        case horizontal
        case vertical
    }

    let axis: Axis
    let isEnabled: Bool
    let onNegativeDirection: () -> Void
    let onPositiveDirection: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            axis: axis,
            isEnabled: isEnabled,
            onNegativeDirection: onNegativeDirection,
            onPositiveDirection: onPositiveDirection
        )
    }

    func makeUIView(context: Context) -> SwipeCaptureView {
        let view = SwipeCaptureView(frame: .zero)
        view.backgroundColor = .clear
        context.coordinator.attachRecognizersIfNeeded(to: view)
        return view
    }

    func updateUIView(_ uiView: SwipeCaptureView, context: Context) {
        context.coordinator.axis = axis
        context.coordinator.isEnabled = isEnabled
        context.coordinator.onNegativeDirection = onNegativeDirection
        context.coordinator.onPositiveDirection = onPositiveDirection
        uiView.captureEnabled = isEnabled
        uiView.isUserInteractionEnabled = isEnabled
        context.coordinator.applyEnabledState()
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var axis: Axis
        var isEnabled: Bool
        var onNegativeDirection: () -> Void
        var onPositiveDirection: () -> Void

        private lazy var leftSwipe = makeRecognizer(direction: .left)
        private lazy var rightSwipe = makeRecognizer(direction: .right)
        private lazy var upSwipe = makeRecognizer(direction: .up)
        private lazy var downSwipe = makeRecognizer(direction: .down)

        init(
            axis: Axis,
            isEnabled: Bool,
            onNegativeDirection: @escaping () -> Void,
            onPositiveDirection: @escaping () -> Void
        ) {
            self.axis = axis
            self.isEnabled = isEnabled
            self.onNegativeDirection = onNegativeDirection
            self.onPositiveDirection = onPositiveDirection
        }

        func attachRecognizersIfNeeded(to view: UIView) {
            if leftSwipe.view == nil { view.addGestureRecognizer(leftSwipe) }
            if rightSwipe.view == nil { view.addGestureRecognizer(rightSwipe) }
            if upSwipe.view == nil { view.addGestureRecognizer(upSwipe) }
            if downSwipe.view == nil { view.addGestureRecognizer(downSwipe) }
            applyEnabledState()
        }

        func applyEnabledState() {
            let horizontalEnabled = isEnabled && axis == .horizontal
            let verticalEnabled = isEnabled && axis == .vertical
            leftSwipe.isEnabled = horizontalEnabled
            rightSwipe.isEnabled = horizontalEnabled
            upSwipe.isEnabled = verticalEnabled
            downSwipe.isEnabled = verticalEnabled
        }

        private func makeRecognizer(direction: UISwipeGestureRecognizer.Direction) -> UISwipeGestureRecognizer {
            let recognizer = UISwipeGestureRecognizer(target: self, action: #selector(handleSwipe(_:)))
            recognizer.direction = direction
            recognizer.numberOfTouchesRequired = 1
            recognizer.cancelsTouchesInView = false
            recognizer.delaysTouchesBegan = false
            recognizer.delegate = self
            return recognizer
        }

        @objc private func handleSwipe(_ recognizer: UISwipeGestureRecognizer) {
            guard recognizer.state == .ended else { return }
            switch recognizer.direction {
            case .left, .up:
                onNegativeDirection()
            case .right, .down:
                onPositiveDirection()
            default:
                break
            }
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            true
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            if touch.type == .pencil {
                return false
            }

            var view: UIView? = touch.view
            while let current = view {
                if current is UIControl {
                    return false
                }
                view = current.superview
            }
            return true
        }
    }
}

final class SwipeCaptureView: UIView {
    var captureEnabled = true

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        guard captureEnabled else { return false }

        if let touches = event?.allTouches, touches.contains(where: { $0.type == .pencil }) {
            return false
        }
        return true
    }
}
