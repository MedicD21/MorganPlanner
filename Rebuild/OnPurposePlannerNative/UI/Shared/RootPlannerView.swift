import SwiftUI

struct RootPlannerView: View {
    @EnvironmentObject private var store: PlannerStore

    var body: some View {
        GeometryReader { proxy in
            let topInset = toolbarHeight
            let spreadSize = plannerSpreadSize(in: proxy.size, topInset: topInset)

            ZStack {
                PlannerTheme.appGradient
                    .ignoresSafeArea()

                PlannerStageView(spreadSize: spreadSize)
                    .padding(.top, topInset + 8)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 8)

                PencilInteractionBridge(store: store)
                    .frame(width: 0, height: 0)
                    .allowsHitTesting(false)

                if store.toolbarPosition == .side {
                    HStack {
                        Spacer(minLength: 0)
                        VStack {
                            Spacer(minLength: 0)
                            FloatingToolbarView(spreadSize: spreadSize)
                                .padding(.trailing, 0)
                            Spacer(minLength: 0)
                        }
                    }
                    .padding(.vertical, 10)
                } else {
                    VStack(spacing: 0) {
                        FloatingToolbarView(spreadSize: spreadSize)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    private var toolbarHeight: CGFloat {
        guard store.toolbarPosition == .top, !store.toolbarCollapsed else {
            return 0
        }
        return 58
    }

    private func plannerSpreadSize(in size: CGSize, topInset: CGFloat) -> CGSize {
        let shellPadX: CGFloat = 12
        let shellPadY: CGFloat = 12
        let availableWidth = max(400, size.width - (shellPadX * 2))
        let availableHeight = max(300, size.height - (shellPadY * 2) - topInset)
        let width = min(1480, availableWidth, availableHeight * 1.56)
        let height = min(availableHeight, availableWidth * 0.64)
        return CGSize(width: width, height: height)
    }
}
