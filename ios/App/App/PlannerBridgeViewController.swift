import UIKit
import Capacitor

class PlannerBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginType(ApplePencilPlugin.self)
    }
}
