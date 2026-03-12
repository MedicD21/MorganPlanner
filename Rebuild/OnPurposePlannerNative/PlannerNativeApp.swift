import SwiftUI

@main
struct PlannerNativeApp: App {
    @StateObject private var store = PlannerStore()

    var body: some Scene {
        WindowGroup {
            RootPlannerView()
                .environmentObject(store)
        }
    }
}
