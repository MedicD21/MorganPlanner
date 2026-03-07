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
        if let webView = bridge?.webView {
            suppressEditMenuInHierarchy(webView)
        }
    }

    // Recursively disables long-press gesture recognizers and removes
    // UIEditMenuInteraction (iOS 16+) from every view in the WKWebView tree.
    // Called after viewDidAppear so WKWebView's internal subviews exist.
    private func suppressEditMenuInHierarchy(_ view: UIView) {
        for recognizer in view.gestureRecognizers ?? [] {
            if recognizer is UILongPressGestureRecognizer {
                recognizer.isEnabled = false
            }
        }
        if #available(iOS 16.0, *) {
            for interaction in view.interactions {
                if interaction is UIEditMenuInteraction {
                    view.removeInteraction(interaction)
                }
            }
        }
        for subview in view.subviews {
            suppressEditMenuInHierarchy(subview)
        }
    }

    private func configureWebView() {
        guard let webView = bridge?.webView else { return }

        // Disable link preview long-press (suppresses callout on links/images)
        webView.allowsLinkPreview = false

        // Inject before page JS: suppress contextmenu/selectstart events and
        // apply user-select:none so iOS has nothing to select → no edit menu.
        let script = """
        (function() {
            function suppress(e) { e.preventDefault(); }
            document.addEventListener('contextmenu', suppress, { capture: true, passive: false });
            document.addEventListener('selectstart', suppress, { capture: true, passive: false });
            var style = document.createElement('style');
            style.textContent = '* { -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; }';
            document.documentElement.appendChild(style);
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
