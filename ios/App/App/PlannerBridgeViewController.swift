import UIKit
import Capacitor
import WebKit

class PlannerBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginType(ApplePencilPlugin.self)
        configureWebView()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Disable long-press gesture recognizers after WKWebView has fully
        // built its internal view hierarchy. This suppresses the iOS edit menu
        // (Copy / Look Up / Translate) that fires during Apple Pencil strokes.
        if let webView = bridge?.webView {
            disableLongPressInHierarchy(webView)
        }
    }

    private func disableLongPressInHierarchy(_ view: UIView) {
        for recognizer in view.gestureRecognizers ?? [] {
            if recognizer is UILongPressGestureRecognizer {
                recognizer.isEnabled = false
            }
        }
        for subview in view.subviews {
            disableLongPressInHierarchy(subview)
        }
    }

    private func configureWebView() {
        guard let webView = bridge?.webView else { return }

        // Disable link preview long-press (suppresses callout on links/images)
        webView.allowsLinkPreview = false

        // Inject contextmenu + selectstart suppression before any page JS runs
        let script = """
        (function() {
            function suppress(e) { e.preventDefault(); }
            document.addEventListener('contextmenu', suppress, { capture: true, passive: false });
            document.addEventListener('selectstart', suppress, { capture: true, passive: false });
        })();
        """
        let userScript = WKUserScript(
            source: script,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        webView.configuration.userContentController.addUserScript(userScript)
    }
}
