import SwiftUI
import PhotosUI

struct FloatingToolbarView: View {
    @EnvironmentObject private var store: PlannerStore
    let spreadSize: CGSize

    @State private var overflowOpen = false
    @State private var colorPopoverOpen = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var customColor: Color = Color(hex: PlannerDefaults.defaultColor)
    @State private var lastPencilToolbarTap: TimeInterval = 0

    var body: some View {
        Group {
            if store.toolbarPosition == .side {
                sideToolbar
            } else {
                topToolbar
            }
        }
        .onChange(of: selectedPhotoItem) { _, newValue in
            guard let newValue else { return }
            Task {
                if let data = try? await newValue.loadTransferable(type: Data.self) {
                    await MainActor.run {
                        store.imageStampData = data
                        store.selectTool(.image)
                    }
                }
            }
        }
        .onChange(of: store.activeColorHex) { _, newValue in
            customColor = Color(hex: newValue)
        }
        .onChange(of: store.activeTool) { _, _ in
            overflowOpen = false
            colorPopoverOpen = false
        }
        .onAppear {
            customColor = Color(hex: store.activeColorHex)
        }
    }

    private var sideToolbar: some View {
        ZStack(alignment: .trailing) {
            if !store.toolbarCollapsed && overflowOpen {
                overflowPanel
                    .offset(x: -66)
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
            }
            if !store.toolbarCollapsed && colorPopoverOpen {
                colorPopover
                    .offset(x: -66)
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
            }

            VStack(spacing: 4) {
                collapseButton
                positionButton
                if !store.toolbarCollapsed {
                    railButtons(vertical: true)
                }
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 4)
            .frame(width: 54)
            .background(toolbarRailBackground)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: Color.black.opacity(0.12), radius: 10, x: 0, y: 2)
        }
        .animation(.easeInOut(duration: 0.15), value: store.toolbarCollapsed)
        .animation(.easeInOut(duration: 0.12), value: overflowOpen)
        .animation(.easeInOut(duration: 0.12), value: colorPopoverOpen)
    }

    private var topToolbar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                collapseButton
                positionButton
                if !store.toolbarCollapsed {
                    railButtons(vertical: false)
                }
            }
            .padding(.horizontal, 8)
            .padding(.top, 6)
            .padding(.bottom, 6)
            .background(toolbarRailBackground)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .shadow(color: Color.black.opacity(0.12), radius: 10, x: 0, y: 2)

            if !store.toolbarCollapsed && colorPopoverOpen {
                colorPopover
                    .padding(.top, 4)
            }
            if !store.toolbarCollapsed && overflowOpen {
                overflowPanel
                    .padding(.top, 4)
            }
        }
        .padding(.top, 2)
        .padding(.horizontal, 4)
        .animation(.easeInOut(duration: 0.15), value: store.toolbarCollapsed)
        .animation(.easeInOut(duration: 0.12), value: overflowOpen)
        .animation(.easeInOut(duration: 0.12), value: colorPopoverOpen)
    }

    private var toolbarRailBackground: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(Color(hex: "#fbfaf7").opacity(0.96))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color(hex: "#2d2928").opacity(0.14), lineWidth: 1)
            )
    }

    @ViewBuilder
    private func railButtons(vertical: Bool) -> some View {
        Group {
            colorDotButton
            divider(vertical: vertical)

            ForEach(Array(store.quickSlots.enumerated()), id: \.offset) { _, tool in
                toolButton(tool: tool, selected: store.activeTool == tool) {
                    handleToolTap(tool)
                }
            }

            divider(vertical: vertical)
            iconButton(systemName: "arrow.uturn.backward", active: false, title: "Undo") {
                store.undoActivePage()
            }
            iconButton(systemName: "arrow.uturn.forward", active: false, title: "Redo") {
                store.redoActivePage()
            }

            divider(vertical: vertical)
            iconButton(systemName: "plus.magnifyingglass", active: false, title: "Zoom in") {
                store.zoomIn(spreadSize: spreadSize)
            }
            iconButton(systemName: "minus.magnifyingglass", active: false, title: "Zoom out") {
                store.zoomOut(spreadSize: spreadSize)
            }

            divider(vertical: vertical)
            iconButton(systemName: "hand.raised", active: store.allowFingerDrawing, title: "Finger drawing") {
                store.allowFingerDrawing.toggle()
            }
            iconButton(systemName: "ellipsis", active: overflowOpen, title: "More options") {
                overflowOpen.toggle()
            }
        }
    }

    private var collapseButton: some View {
        iconButton(
            systemName: collapseSymbol,
            active: false,
            title: store.toolbarCollapsed ? "Expand toolbar" : "Collapse toolbar"
        ) {
            store.toolbarCollapsed.toggle()
        }
    }

    private var positionButton: some View {
        iconButton(
            systemName: store.toolbarPosition == .side ? "arrow.up.and.down" : "arrow.left.and.right",
            active: false,
            title: store.toolbarPosition == .side ? "Move toolbar to top" : "Move toolbar to side"
        ) {
            store.toolbarPosition = (store.toolbarPosition == .side) ? .top : .side
        }
    }

    private var colorDotButton: some View {
        Button {
            colorPopoverOpen.toggle()
        } label: {
            Circle()
                .fill(store.activeTool.supportsColor ? Color(hex: store.activeColorHex) : Color(hex: "#c8c2bb"))
                .frame(width: 24, height: 24)
                .overlay(
                    Circle()
                        .stroke(Color.white.opacity(0.9), lineWidth: 2)
                )
                .shadow(color: Color.black.opacity(0.16), radius: 3, x: 0, y: 2)
        }
        .buttonStyle(.plain)
        .disabled(!store.activeTool.supportsColor)
    }

    private func divider(vertical: Bool) -> some View {
        Rectangle()
            .fill(Color(hex: "#2d2928").opacity(0.12))
            .frame(width: vertical ? 28 : 1, height: vertical ? 1 : 24)
            .padding(vertical ? .vertical : .horizontal, 2)
    }

    private func toolButton(tool: PlannerTool, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 1) {
                Image(systemName: toolIconName(tool))
                    .font(.system(size: 15, weight: .semibold))
                if store.toolbarPosition == .top {
                    Text(tool.label.prefix(1))
                        .font(.system(size: 8, weight: .medium))
                }
            }
            .frame(width: 40, height: 40)
            .foregroundStyle(selected ? Color(hex: "#5c2d3c") : PlannerTheme.ink)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(selected ? Color(hex: "#8f5e6b").opacity(0.18) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(selected ? Color(hex: "#8f5e6b").opacity(0.5) : Color.clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }

    private func iconButton(systemName: String, active: Bool, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 15, weight: .semibold))
                .frame(width: 40, height: 40)
                .foregroundStyle(active ? Color(hex: "#5c2d3c") : PlannerTheme.ink)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(active ? Color(hex: "#8f5e6b").opacity(0.18) : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(active ? Color(hex: "#8f5e6b").opacity(0.5) : Color.clear, lineWidth: 1.5)
                )
        }
        .buttonStyle(.plain)
        .help(title)
    }

    private var overflowPanel: some View {
        ToolbarOverflowPanel(
            selectedPhotoItem: $selectedPhotoItem,
            isStrokeEnabled: isStrokeEnabled,
            onToolTap: { tool in
                handleToolTap(tool)
            },
            onClose: {
                overflowOpen = false
            }
        )
        .environmentObject(store)
    }

    private var colorPopover: some View {
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 24), spacing: 6)], spacing: 6) {
                ForEach(store.visibleColorSwatches, id: \.self) { swatch in
                    Button {
                        store.activeColorHex = swatch
                        colorPopoverOpen = false
                    } label: {
                        Circle()
                            .fill(Color(hex: swatch))
                            .frame(width: 22, height: 22)
                            .overlay(
                                Circle()
                                    .stroke(store.activeColorHex == swatch ? Color.white : Color.clear, lineWidth: 2)
                            )
                            .overlay(
                                Circle()
                                    .stroke(Color.black.opacity(0.15), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(!store.activeTool.supportsColor)
                }
            }

            HStack(spacing: 8) {
                ColorPicker("", selection: $customColor)
                    .labelsHidden()
                    .disabled(!store.activeTool.supportsColor)
                    .onChange(of: customColor) { _, newValue in
                        let ui = UIColor(newValue)
                        store.activeColorHex = ui.hexString
                    }

                Button("Save") {
                    store.saveCurrentColor()
                    colorPopoverOpen = false
                }
                .buttonStyle(.bordered)
                .disabled(!store.activeTool.supportsColor)
            }
        }
        .padding(10)
        .frame(width: 180)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color(hex: "#fbfaf7").opacity(0.96))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color(hex: "#2d2928").opacity(0.12), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.16), radius: 10, x: 0, y: 5)
    }

    private var collapseSymbol: String {
        if store.toolbarPosition == .side {
            return store.toolbarCollapsed ? "chevron.left" : "chevron.right"
        }
        return store.toolbarCollapsed ? "chevron.down" : "chevron.up"
    }

    private var isStrokeEnabled: Bool {
        switch store.activeTool {
        case .bucket, .lasso, .elements, .text, .image, .sticky:
            return false
        default:
            return true
        }
    }

    private func handleToolTap(_ tool: PlannerTool) {
        let now = Date().timeIntervalSince1970
        if tool == .pencil,
           store.activeTool == .pencil,
           (now - lastPencilToolbarTap) <= 0.34 {
            lastPencilToolbarTap = 0
            store.toggleEraserFromPencilAction()
            return
        }

        lastPencilToolbarTap = (tool == .pencil) ? now : 0
        store.selectTool(tool)
    }

    private func toolIconName(_ tool: PlannerTool) -> String {
        switch tool {
        case .pen: return "pencil.tip"
        case .pencil: return "pencil"
        case .highlighter: return "highlighter"
        case .eraser: return "eraser"
        case .bucket: return "paintbrush.pointed"
        case .shape: return "square.on.circle"
        case .lasso: return "lasso"
        case .elements: return "sparkles"
        case .text: return "textformat"
        case .image: return "photo"
        case .sticky: return "note.text"
        }
    }
}
