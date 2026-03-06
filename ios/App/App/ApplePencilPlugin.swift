import Foundation
import Capacitor
import UIKit

@objc(ApplePencilPlugin)
public class ApplePencilPlugin: CAPPlugin, CAPBridgedPlugin, UIPencilInteractionDelegate {
    public let identifier = "ApplePencilPlugin"
    public let jsName = "ApplePencil"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise)
    ]

    private var pencilInteraction: UIPencilInteraction?

    public override func load() {
        DispatchQueue.main.async { [weak self] in
            self?.attachInteractionIfNeeded()
        }
    }

    @objc public func getCapabilities(_ call: CAPPluginCall) {
        var response: [String: Any] = [
            "available": true,
            "supportsTap": true,
            "prefersPencilOnlyDrawing": UIPencilInteraction.prefersPencilOnlyDrawing,
            "preferredTapAction": self.preferredActionString(UIPencilInteraction.preferredTapAction)
        ]

        if #available(iOS 17.5, *) {
            response["supportsSqueeze"] = true
            response["preferredSqueezeAction"] = preferredActionString(UIPencilInteraction.preferredSqueezeAction)
            response["prefersHoverToolPreview"] = UIPencilInteraction.prefersHoverToolPreview
        } else {
            response["supportsSqueeze"] = false
            response["preferredSqueezeAction"] = "unsupported"
            response["prefersHoverToolPreview"] = false
        }

        call.resolve(response)
    }

    private func attachInteractionIfNeeded() {
        guard pencilInteraction == nil else {
            return
        }

        guard let hostView = bridge?.viewController?.view else {
            return
        }

        let interaction: UIPencilInteraction
        if #available(iOS 17.5, *) {
            interaction = UIPencilInteraction(delegate: self)
        } else {
            interaction = UIPencilInteraction()
            interaction.delegate = self
        }

        interaction.isEnabled = true
        hostView.addInteraction(interaction)
        pencilInteraction = interaction
    }

    public func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        notifyListeners(
            "pencilTap",
            data: [
                "timestamp": Date().timeIntervalSince1970,
                "preferredAction": preferredActionString(UIPencilInteraction.preferredTapAction)
            ]
        )
    }

    @available(iOS 17.5, *)
    public func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
        var payload: [String: Any] = [
            "timestamp": tap.timestamp,
            "preferredAction": preferredActionString(UIPencilInteraction.preferredTapAction)
        ]
        payload["hoverPose"] = hoverPoseDictionary(tap.hoverPose)
        notifyListeners("pencilTap", data: payload)
    }

    @available(iOS 17.5, *)
    public func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        var payload: [String: Any] = [
            "timestamp": squeeze.timestamp,
            "phase": interactionPhaseString(squeeze.phase),
            "preferredAction": preferredActionString(UIPencilInteraction.preferredSqueezeAction)
        ]
        payload["hoverPose"] = hoverPoseDictionary(squeeze.hoverPose)
        notifyListeners("pencilSqueeze", data: payload)
    }

    @available(iOS 17.5, *)
    private func hoverPoseDictionary(_ pose: UIPencilHoverPose?) -> [String: Any]? {
        guard let pose else {
            return nil
        }
        return [
            "locationX": pose.location.x,
            "locationY": pose.location.y,
            "zOffset": pose.zOffset,
            "azimuthAngle": pose.azimuthAngle,
            "altitudeAngle": pose.altitudeAngle,
            "rollAngle": pose.rollAngle
        ]
    }

    @available(iOS 17.5, *)
    private func interactionPhaseString(_ phase: UIPencilInteraction.Phase) -> String {
        switch phase {
        case .began:
            return "began"
        case .changed:
            return "changed"
        case .ended:
            return "ended"
        case .cancelled:
            return "cancelled"
        @unknown default:
            return "unknown"
        }
    }

    private func preferredActionString(_ action: UIPencilPreferredAction) -> String {
        if #available(iOS 17.5, *) {
            if action == .showContextualPalette {
                return "showContextualPalette"
            }
            if action == .runSystemShortcut {
                return "runSystemShortcut"
            }
        }

        if #available(iOS 16.0, *) {
            if action == .showInkAttributes {
                return "showInkAttributes"
            }
        }

        switch action {
        case .ignore:
            return "ignore"
        case .switchEraser:
            return "switchEraser"
        case .switchPrevious:
            return "switchPrevious"
        case .showColorPalette:
            return "showColorPalette"
        default:
            return "unknown"
        }
    }
}
