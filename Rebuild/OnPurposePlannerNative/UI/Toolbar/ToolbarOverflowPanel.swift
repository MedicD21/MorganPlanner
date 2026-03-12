import SwiftUI
import PhotosUI

struct ToolbarOverflowPanel: View {
    @EnvironmentObject private var store: PlannerStore
    @Binding var selectedPhotoItem: PhotosPickerItem?
    let isStrokeEnabled: Bool
    let onToolTap: (PlannerTool) -> Void
    let onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                toolsSection
                Divider()
                quickSlotsSection
                Divider()
                strokeSection
                contextualSection
                Divider()
                stylesSection
                Divider()
                positionSection
            }
            .padding(12)
        }
        .frame(width: 300, height: 430)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(hex: "#fbfaf7").opacity(0.96))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color(hex: "#2d2928").opacity(0.12), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.16), radius: 14, x: 0, y: 6)
    }

    private var toolsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("Tools")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 56), spacing: 8)], spacing: 8) {
                ForEach(PlannerTool.allCases) { tool in
                    Button {
                        onToolTap(tool)
                    } label: {
                        Image(systemName: iconName(tool))
                            .font(.system(size: 14, weight: .semibold))
                            .frame(width: 34, height: 34)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(store.activeTool == tool ? Color(hex: "#8f5e6b").opacity(0.18) : Color.clear)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(Color(hex: "#2d2928").opacity(0.15), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var quickSlotsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("Quick Slots")
            HStack(spacing: 8) {
                ForEach(Array(store.quickSlots.enumerated()), id: \.offset) { idx, tool in
                    Button {
                        store.assignQuickSlot(index: idx, tool: store.activeTool)
                    } label: {
                        VStack(spacing: 3) {
                            Image(systemName: iconName(tool))
                            Text("\(idx + 1)")
                                .font(.system(size: 9, weight: .medium))
                        }
                        .frame(width: 36, height: 36)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(Color(hex: "#2d2928").opacity(0.15), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var strokeSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("Weight - \(String(format: "%.1f", store.strokeSize))")
            Slider(value: $store.strokeSize, in: PlannerDefaults.minStroke...PlannerDefaults.maxStroke, step: 0.1)
                .disabled(!isStrokeEnabled)
            HStack(spacing: 6) {
                ForEach(InkTip.allCases) { tip in
                    Button(tip.rawValue.prefix(1).uppercased()) {
                        store.activeTip = tip
                    }
                    .buttonStyle(.bordered)
                    .tint(store.activeTip == tip ? PlannerTheme.accent : .gray)
                    .disabled(!store.activeTool.isDrawingTool)
                }
            }
        }
    }

    @ViewBuilder
    private var contextualSection: some View {
        if store.activeTool == .shape {
            HStack(spacing: 6) {
                ForEach(ShapeKind.allCases) { kind in
                    Button(kind.label) {
                        store.shapeKind = kind
                    }
                    .buttonStyle(.bordered)
                    .tint(store.shapeKind == kind ? PlannerTheme.accent : .gray)
                }
            }
        }

        if store.activeTool == .elements {
            HStack(spacing: 6) {
                ForEach(PlannerDefaults.symbolOptions, id: \.self) { symbol in
                    Button(symbol.isEmpty ? "Draw" : symbol) {
                        store.activeSymbol = symbol
                    }
                    .buttonStyle(.bordered)
                    .tint(store.activeSymbol == symbol ? PlannerTheme.accent : .gray)
                }
            }
        }

        if store.activeTool == .text {
            TextField("Text stamp", text: $store.textStamp)
                .textFieldStyle(.roundedBorder)
        }

        if store.activeTool == .image {
            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                Label("Pick Image", systemImage: "photo")
            }
        }
    }

    private var stylesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button("+ Save Style") {
                    store.saveCurrentStyle()
                }
                .buttonStyle(.bordered)
                .disabled(!store.canSaveStyle)
                Spacer(minLength: 0)
            }

            ForEach(store.favoriteStyles.prefix(4)) { style in
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color(hex: style.colorHex))
                        .frame(width: 10, height: 10)
                    Button("\(style.tool.label) \(String(format: "%.1f", style.size))") {
                        store.applyStyle(style)
                        onClose()
                    }
                    .buttonStyle(.plain)
                    Spacer(minLength: 0)
                    Button {
                        store.deleteStyle(style.id)
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var positionSection: some View {
        HStack(spacing: 8) {
            Button("Side") { store.toolbarPosition = .side }
                .buttonStyle(.bordered)
                .tint(store.toolbarPosition == .side ? PlannerTheme.accent : .gray)
            Button("Top") { store.toolbarPosition = .top }
                .buttonStyle(.bordered)
                .tint(store.toolbarPosition == .top ? PlannerTheme.accent : .gray)
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.secondary)
    }

    private func iconName(_ tool: PlannerTool) -> String {
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
