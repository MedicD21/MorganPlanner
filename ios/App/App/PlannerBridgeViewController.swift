import UIKit
import Capacitor
import WebKit

class PlannerBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginType(ApplePencilPlugin.self)
        configureWebView()
    }

    private func configureWebView() {
        guard let webView = bridge?.webView else { return }

        // Disable link preview long-press (suppresses callout on links/images)
        webView.allowsLinkPreview = false

        // Disable native iOS text interaction (Copy/Look Up/Translate popup).
        // textInteractionEnabled is a public property since iOS 14.5 but the
        // Xcode SDK spelling can vary; KVC sets it reliably at runtime.
        webView.setValue(false, forKey: "textInteractionEnabled")

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
