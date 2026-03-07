import UIKit
import Capacitor
import WebKit

class PlannerBridgeViewController: CAPBridgeViewController {
    private var suppressionTimer: Timer?

    override open func capacitorDidLoad() {
        bridge?.registerPluginType(ApplePencilPlugin.self)
        configureWebView()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Initial suppression passes at 0 / 500 / 2000 ms to catch recognizers
        // that WKWebView adds while the page is loading.
        suppressAfterDelay(0)
        suppressAfterDelay(500)
        suppressAfterDelay(2000)
        // Repeating timer: WKWebView re-adds gesture recognizers every time the
        // user interacts, so we need to keep clearing them continuously.
        suppressionTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            guard let webView = self?.bridge?.webView else { return }
            self?.suppressEditMenuInHierarchy(webView)
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        suppressionTimer?.invalidate()
        suppressionTimer = nil
    }

    private func suppressAfterDelay(_ ms: Int) {
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(ms)) { [weak self] in
            guard let webView = self?.bridge?.webView else { return }
            self?.suppressEditMenuInHierarchy(webView)
        }
    }

    // Recursively disables long-press gesture recognizers and removes text
    // interaction objects from every view in the WKWebView tree.
    private func suppressEditMenuInHierarchy(_ view: UIView) {
        for recognizer in view.gestureRecognizers ?? [] {
            if recognizer is UILongPressGestureRecognizer {
                recognizer.isEnabled = false
            }
        }
        for interaction in view.interactions {
            if #available(iOS 16.0, *) {
                if interaction is UIEditMenuInteraction {
                    view.removeInteraction(interaction)
                    continue
                }
            }
            if interaction is UITextInteraction {
                view.removeInteraction(interaction)
            }
        }
        for subview in view.subviews {
            suppressEditMenuInHierarchy(subview)
        }
    }

    // Suppress WKWebView's context menu (long-press on links/images shows
    // Copy/Look Up/Translate). Return nil to cancel the menu entirely.
    func webView(
        _ webView: WKWebView,
        contextMenuConfigurationForElement elementInfo: WKContextMenuElementInfo,
        completionHandler: @escaping (UIContextMenuConfiguration?) -> Void
    ) {
        completionHandler(nil)
    }

    private func configureWebView() {
        guard let webView = bridge?.webView else { return }

        // Disable link preview long-press (suppresses callout on links/images)
        webView.allowsLinkPreview = false

        // Disable data detectors (date / phone / address auto-links that trigger
        // the Look Up menu on long press).
        webView.configuration.dataDetectorTypes = []

        // Inject before page JS: suppress contextmenu/selectstart events and
        // apply user-select:none so iOS has nothing to select → no edit menu.
        let script = """
        (function() {
            // --- Suppress context menu / text selection ---
            function suppress(e) { e.preventDefault(); }
            document.addEventListener('contextmenu', suppress, { capture: true, passive: false });
            document.addEventListener('selectstart', suppress, { capture: true, passive: false });
            document.addEventListener('selectionchange', function() {
                var sel = window.getSelection();
                if (sel && sel.rangeCount > 0) { sel.removeAllRanges(); }
            }, { capture: true });

            // --- Disable iOS data detector links (date / phone / address) ---
            var meta = document.createElement('meta');
            meta.name = 'format-detection';
            meta.content = 'telephone=no, date=no, address=no, email=no, url=no';
            document.documentElement.appendChild(meta);

            // --- Block palm touches while Apple Pencil is active ---
            // InkLayer already blocks touches on the canvas surface, but a palm
            // landing anywhere else (toolbar, calendar headers, gutters) falls
            // through to WKWebView's native long-press / text selection.
            // This global handler prevents that regardless of where the touch lands.
            var activePenPointers = new Set();
            document.addEventListener('pointerdown', function(e) {
                // pressure > 0 filters out Apple Pencil hover events (which fire
                // pointerdown with pressure 0 on Pencil Pro / iOS 26 hover).
                if (e.pointerType === 'pen' && e.pressure > 0) activePenPointers.add(e.pointerId);
            }, { capture: true });
            document.addEventListener('pointerup', function(e) {
                activePenPointers.delete(e.pointerId);
            }, { capture: true });
            document.addEventListener('pointercancel', function(e) {
                activePenPointers.delete(e.pointerId);
            }, { capture: true });
            document.addEventListener('touchstart', function(e) {
                if (activePenPointers.size > 0) { e.preventDefault(); }
            }, { capture: true, passive: false });

            // --- CSS: nothing is selectable, data-detector links are inert ---
            var style = document.createElement('style');
            style.textContent = [
                '* { -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; }',
                'a[x-apple-data-detectors] { pointer-events: none !important; }'
            ].join('\\n');
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
