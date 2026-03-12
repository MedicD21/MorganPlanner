import Foundation
import SwiftUI

@MainActor
final class PlannerStore: ObservableObject {
    @Published var year: Int = PlannerStore.defaultYear {
        didSet { scheduleSave() }
    }
    @Published var month: Int = PlannerStore.defaultMonth {
        didSet { scheduleSave() }
    }
    @Published var weekIndex: Int = PlannerStore.defaultWeekIndex {
        didSet { scheduleSave() }
    }
    @Published var activeSpread: PlannerSpread = .monthWeek {
        didSet { scheduleSave() }
    }

    @Published var activeTool: PlannerTool = .pen {
        didSet {
            if activeTool != .eraser {
                lastNonEraserTool = activeTool
            }
            if activeTool.isDrawingTool {
                lastDrawingTool = activeTool
            }
            scheduleSave()
        }
    }
    @Published var activeColorHex: String = PlannerDefaults.defaultColor {
        didSet {
            let normalized = normalizedColorHex(activeColorHex)
            guard normalized == activeColorHex else {
                activeColorHex = normalized
                return
            }
            scheduleSave()
        }
    }
    @Published var strokeSize: Double = PlannerDefaults.defaultStrokeSize {
        didSet {
            let clamped = clampStroke(strokeSize)
            guard abs(clamped - strokeSize) > 0.0001 else {
                scheduleSave()
                return
            }
            strokeSize = clamped
            return
        }
    }
    @Published var activeTip: InkTip = .round {
        didSet { scheduleSave() }
    }
    @Published var shapeKind: ShapeKind = .line {
        didSet { scheduleSave() }
    }
    @Published var activeSymbol: String = "" {
        didSet { scheduleSave() }
    }
    @Published var textStamp: String = "note" {
        didSet { scheduleSave() }
    }
    @Published var imageStampData: Data? {
        didSet { scheduleSave() }
    }
    @Published var allowFingerDrawing: Bool = false {
        didSet { scheduleSave() }
    }

    @Published var zoomScale: Double = PlannerDefaults.minZoom {
        didSet {
            let clamped = clampZoomScale(zoomScale)
            guard abs(clamped - zoomScale) > 0.0001 else {
                scheduleSave()
                return
            }
            zoomScale = clamped
            return
        }
    }
    @Published var zoomOffsetX: Double = 0 {
        didSet { scheduleSave() }
    }
    @Published var zoomOffsetY: Double = 0 {
        didSet { scheduleSave() }
    }

    @Published var toolbarPosition: ToolbarPosition = .side {
        didSet { scheduleSave() }
    }
    @Published var toolbarCollapsed: Bool = false {
        didSet { scheduleSave() }
    }
    @Published var quickSlots: [PlannerTool] = PlannerDefaults.quickSlots {
        didSet {
            let normalized = normalizedQuickSlots(quickSlots)
            guard normalized == quickSlots else {
                quickSlots = normalized
                return
            }
            scheduleSave()
        }
    }
    @Published var favoriteColors: [String] = [] {
        didSet { scheduleSave() }
    }
    @Published var favoriteStyles: [FavoriteStyle] = [] {
        didSet { scheduleSave() }
    }

    @Published private(set) var pages: [String: PageContent] = [:] {
        didSet { scheduleSave() }
    }
    @Published var activePageID: String? {
        didSet { scheduleSave() }
    }

    private var lastNonEraserTool: PlannerTool = .pen
    private var lastDrawingTool: PlannerTool = .pen
    private var isHydrating = true
    private var saveTask: Task<Void, Never>?

    private struct PageHistory {
        var undo: [PageContent] = []
        var redo: [PageContent] = []
    }
    private var historyByPage: [String: PageHistory] = [:]

    struct PlannerSnapshot: Codable {
        var year: Int
        var month: Int
        var weekIndex: Int
        var activeSpread: PlannerSpread
        var activeTool: PlannerTool
        var activeColorHex: String
        var strokeSize: Double
        var activeTip: InkTip
        var shapeKind: ShapeKind
        var activeSymbol: String
        var textStamp: String
        var imageStampData: Data?
        var allowFingerDrawing: Bool
        var zoomScale: Double
        var zoomOffsetX: Double
        var zoomOffsetY: Double
        var toolbarPosition: ToolbarPosition
        var toolbarCollapsed: Bool
        var quickSlots: [PlannerTool]
        var favoriteColors: [String]
        var favoriteStyles: [FavoriteStyle]
        var pages: [String: PageContent]
        var activePageID: String?
    }

    static var defaultYear: Int {
        Calendar.current.component(.year, from: Date())
    }
    static var defaultMonth: Int {
        Calendar.current.component(.month, from: Date())
    }
    static var defaultWeekIndex: Int {
        currentWeekIndex(year: defaultYear, month: defaultMonth)
    }

    nonisolated static var snapshotURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let directory = base.appendingPathComponent("OnPurposePlannerNative", isDirectory: true)
        return directory.appendingPathComponent("planner-state-v1.json")
    }

    init() {
        restoreSnapshotIfAvailable()
        clampCoreState()
        isHydrating = false
    }

    deinit {
        saveTask?.cancel()
    }

    var calendarData: PlannerCalendarMonth {
        generateCalendar(year: year, month: month)
    }

    var safeWeekIndex: Int {
        let maxIndex = max(0, calendarData.weeks.count - 1)
        return min(max(0, weekIndex), maxIndex)
    }

    var selectedWeek: [PlannerCalendarCell] {
        let weeks = calendarData.weeks
        guard !weeks.isEmpty else { return [] }
        return weeks[safeWeekIndex]
    }

    var effectiveLineWidth: Double {
        switch activeTool {
        case .highlighter:
            return clampStroke(strokeSize) * 2.3
        case .pencil:
            return clampStroke(strokeSize) * 0.9
        default:
            return clampStroke(strokeSize)
        }
    }

    var effectiveOpacity: Double {
        switch activeTool {
        case .highlighter:
            return 0.28
        case .pencil:
            return 0.75
        default:
            return 1
        }
    }

    var eraseRadius: Double {
        max(10, clampStroke(strokeSize) * 6)
    }

    var monthPageID: String {
        "planner-ink-\(year)-month-\(month)"
    }

    var weekPageID: String {
        "planner-ink-\(year)-month-\(month)-week-\(safeWeekIndex)"
    }

    var planningLeftPageID: String {
        "planner-ink-\(year)-month-\(month)-planning-left"
    }

    var planningRightPageID: String {
        "planner-ink-\(year)-month-\(month)-planning-right"
    }

    var notesLeftPageID: String {
        "planner-ink-\(year)-month-\(month)-notes-left"
    }

    var notesRightPageID: String {
        "planner-ink-\(year)-month-\(month)-notes-right"
    }

    var visiblePageIDs: [String] {
        switch activeSpread {
        case .monthWeek:
            return [monthPageID, weekPageID]
        case .planning:
            return [planningLeftPageID, planningRightPageID]
        case .notes:
            return [notesLeftPageID, notesRightPageID]
        }
    }

    var visibleColorSwatches: [String] {
        var merged = favoriteColors
        for swatch in PlannerDefaults.defaultPalette where !merged.contains(swatch) {
            merged.append(swatch)
        }
        return Array(merged.prefix(PlannerDefaults.favoriteColorLimit))
    }

    var canSaveStyle: Bool {
        activeTool.isDrawingTool
    }

    var zoomOffset: CGSize {
        CGSize(width: zoomOffsetX, height: zoomOffsetY)
    }

    func pageContent(for pageID: String) -> PageContent {
        pages[pageID] ?? PageContent()
    }

    func setActivePage(_ pageID: String) {
        if activePageID != pageID {
            activePageID = pageID
        }
    }

    func setMonth(_ targetMonth: Int) {
        let clamped = min(max(targetMonth, 1), 12)
        month = clamped
        weekIndex = 0
        activeSpread = .monthWeek
    }

    func changeMonth(by offset: Int) {
        let base = month - 1
        let wrapped = ((base + offset) % 12 + 12) % 12
        month = wrapped + 1
        weekIndex = 0
        activeSpread = .monthWeek
    }

    func setWeek(_ targetWeek: Int) {
        weekIndex = min(max(targetWeek, 0), max(0, calendarData.weeks.count - 1))
        activeSpread = .monthWeek
    }

    func navigateWeek(by offset: Int) {
        setWeek(safeWeekIndex + offset)
    }

    func openSpread(_ spread: PlannerSpread) {
        activeSpread = spread
    }

    func selectTool(_ tool: PlannerTool) {
        activeTool = tool
        if tool == .eraser || tool == .bucket || tool == .lasso || tool == .shape || tool == .image || tool == .sticky {
            activeSymbol = ""
        }
    }

    func toggleEraserFromPencilAction() {
        if activeTool == .eraser {
            selectTool(lastNonEraserTool == .eraser ? .pen : lastNonEraserTool)
        } else {
            lastNonEraserTool = activeTool
            selectTool(.eraser)
        }
    }

    func switchToPreviousTool() {
        selectTool(lastNonEraserTool == .eraser ? .pen : lastNonEraserTool)
    }

    func handlePencilAction(_ action: PencilAction) {
        switch action {
        case .ignore:
            break
        case .switchPrevious:
            switchToPreviousTool()
        default:
            toggleEraserFromPencilAction()
        }
    }

    func saveCurrentColor() {
        let normalized = activeColorHex.lowercased()
        guard isValidHexColor(normalized) else { return }
        if favoriteColors.contains(normalized) { return }
        favoriteColors = Array(([normalized] + favoriteColors).prefix(PlannerDefaults.favoriteColorLimit))
    }

    func saveCurrentStyle() {
        guard canSaveStyle else { return }
        let normalizedColor = activeColorHex.lowercased()
        let normalizedSize = clampStroke(strokeSize)
        let style = FavoriteStyle(
            id: makeID(),
            tool: activeTool,
            colorHex: normalizedColor,
            size: normalizedSize,
            tip: activeTip
        )
        let exists = favoriteStyles.contains(where: { item in
            item.tool == style.tool &&
            item.colorHex == style.colorHex &&
            abs(item.size - style.size) < 0.001 &&
            item.tip == style.tip
        })
        guard !exists else { return }
        favoriteStyles = Array(([style] + favoriteStyles).prefix(PlannerDefaults.favoriteStyleLimit))
    }

    func applyStyle(_ style: FavoriteStyle) {
        selectTool(style.tool)
        activeColorHex = style.colorHex
        strokeSize = clampStroke(style.size)
        activeTip = style.tip
        activeSymbol = ""
    }

    func deleteStyle(_ id: String) {
        favoriteStyles.removeAll(where: { $0.id == id })
    }

    func assignQuickSlot(index: Int, tool: PlannerTool) {
        guard quickSlots.indices.contains(index) else { return }
        var slots = quickSlots
        slots[index] = tool
        quickSlots = slots
    }

    func zoomIn(spreadSize: CGSize) {
        setZoom(
            scale: min(zoomScale + 0.2, PlannerDefaults.maxZoom),
            offsetX: zoomOffsetX,
            offsetY: zoomOffsetY,
            spreadSize: spreadSize
        )
    }

    func zoomOut(spreadSize: CGSize) {
        setZoom(
            scale: max(zoomScale - 0.2, PlannerDefaults.minZoom),
            offsetX: zoomOffsetX,
            offsetY: zoomOffsetY,
            spreadSize: spreadSize
        )
    }

    func resetZoom() {
        zoomScale = 1
        zoomOffsetX = 0
        zoomOffsetY = 0
    }

    func commitZoom(scaleMultiplier: Double, additionalOffset: CGSize, spreadSize: CGSize) {
        let candidateScale = zoomScale * scaleMultiplier
        setZoom(
            scale: candidateScale,
            offsetX: zoomOffsetX + additionalOffset.width,
            offsetY: zoomOffsetY + additionalOffset.height,
            spreadSize: spreadSize
        )
    }

    func commitPan(translation: CGSize, spreadSize: CGSize, scale: Double? = nil) {
        let scaleToUse = scale ?? zoomScale
        let clamped = clampOffset(
            x: zoomOffsetX + translation.width,
            y: zoomOffsetY + translation.height,
            scale: scaleToUse,
            spreadSize: spreadSize
        )
        zoomOffsetX = clamped.x
        zoomOffsetY = clamped.y
    }

    func setDrawingData(_ data: Data, for pageID: String, recordUndo: Bool) {
        updatePage(pageID: pageID, recordUndo: recordUndo) { page in
            page.drawingData = data
        }
    }

    func addFill(pageID: String, rect: PlannerRect, colorHex: String, opacity: Double) {
        updatePage(pageID: pageID) { page in
            page.fills.append(
                PageFill(
                    id: makeID(),
                    rect: rect,
                    colorHex: colorHex,
                    opacity: opacity
                )
            )
        }
    }

    func addShape(pageID: String, kind: ShapeKind, start: PlannerPoint, end: PlannerPoint) {
        updatePage(pageID: pageID) { page in
            page.shapes.append(
                PageShape(
                    id: makeID(),
                    kind: kind,
                    start: start,
                    end: end,
                    colorHex: activeColorHex,
                    lineWidth: effectiveLineWidth,
                    opacity: effectiveOpacity
                )
            )
        }
    }

    func addStamp(pageID: String, text: String, center: PlannerPoint) {
        updatePage(pageID: pageID) { page in
            page.stamps.append(
                PageStamp(
                    id: makeID(),
                    text: text,
                    center: center,
                    colorHex: activeColorHex,
                    fontSize: 18
                )
            )
        }
    }

    func addImageStamp(pageID: String, center: PlannerPoint) {
        guard let imageData = imageStampData else { return }
        updatePage(pageID: pageID) { page in
            page.images.append(
                PageImageStamp(
                    id: makeID(),
                    center: center,
                    width: 0.2,
                    height: 0.2,
                    opacity: 1,
                    imageData: imageData
                )
            )
        }
    }

    func addSticky(pageID: String, origin: PlannerPoint) {
        updatePage(pageID: pageID) { page in
            page.stickies.append(
                StickyNoteModel(
                    id: makeID(),
                    origin: origin,
                    width: 0.22,
                    height: 0.2,
                    collapsed: false,
                    colorHex: "#faefb5",
                    text: ""
                )
            )
        }
        selectTool(lastDrawingTool)
    }

    func moveSticky(pageID: String, stickyID: String, origin: PlannerPoint) {
        updatePage(pageID: pageID, recordUndo: false) { page in
            guard let index = page.stickies.firstIndex(where: { $0.id == stickyID }) else { return }
            page.stickies[index].origin = origin
        }
    }

    func toggleStickyCollapsed(pageID: String, stickyID: String) {
        updatePage(pageID: pageID) { page in
            guard let index = page.stickies.firstIndex(where: { $0.id == stickyID }) else { return }
            page.stickies[index].collapsed.toggle()
        }
    }

    func updateStickyText(pageID: String, stickyID: String, text: String) {
        updatePage(pageID: pageID, recordUndo: false) { page in
            guard let index = page.stickies.firstIndex(where: { $0.id == stickyID }) else { return }
            page.stickies[index].text = text
        }
    }

    func deleteSticky(pageID: String, stickyID: String) {
        updatePage(pageID: pageID) { page in
            page.stickies.removeAll(where: { $0.id == stickyID })
        }
    }

    func undoActivePage() {
        let target = activePageID ?? visiblePageIDs.first
        guard let pageID = target else { return }
        undo(pageID: pageID)
    }

    func redoActivePage() {
        let target = activePageID ?? visiblePageIDs.first
        guard let pageID = target else { return }
        redo(pageID: pageID)
    }

    private func undo(pageID: String) {
        var history = historyByPage[pageID] ?? PageHistory()
        guard let previous = history.undo.popLast() else { return }
        let current = pages[pageID] ?? PageContent()
        history.redo.append(current)
        historyByPage[pageID] = history
        var nextPages = pages
        nextPages[pageID] = previous
        pages = nextPages
    }

    private func redo(pageID: String) {
        var history = historyByPage[pageID] ?? PageHistory()
        guard let nextSnapshot = history.redo.popLast() else { return }
        let current = pages[pageID] ?? PageContent()
        history.undo.append(current)
        historyByPage[pageID] = history
        var nextPages = pages
        nextPages[pageID] = nextSnapshot
        pages = nextPages
    }

    private func updatePage(pageID: String, recordUndo: Bool = true, mutate: (inout PageContent) -> Void) {
        var page = pages[pageID] ?? PageContent()
        let before = page
        mutate(&page)
        guard before != page else { return }

        if recordUndo {
            pushUndo(before, for: pageID)
        }

        var next = pages
        next[pageID] = page
        pages = next
    }

    private func pushUndo(_ snapshot: PageContent, for pageID: String) {
        var history = historyByPage[pageID] ?? PageHistory()
        if history.undo.last != snapshot {
            history.undo.append(snapshot)
            if history.undo.count > PlannerDefaults.historyDepth {
                history.undo.removeFirst(history.undo.count - PlannerDefaults.historyDepth)
            }
        }
        history.redo.removeAll()
        historyByPage[pageID] = history
    }

    private func setZoom(scale: Double, offsetX: Double, offsetY: Double, spreadSize: CGSize) {
        let clampedScale = clampZoomScale(scale)
        let clampedOffset = clampOffset(x: offsetX, y: offsetY, scale: clampedScale, spreadSize: spreadSize)
        zoomScale = clampedScale
        zoomOffsetX = clampedOffset.x
        zoomOffsetY = clampedOffset.y
    }

    private func clampOffset(x: Double, y: Double, scale: Double, spreadSize: CGSize) -> (x: Double, y: Double) {
        if scale <= PlannerDefaults.minZoom + 0.001 {
            return (0, 0)
        }
        let maxX = max(0, (spreadSize.width * CGFloat(scale - 1)) / 2)
        let maxY = max(0, (spreadSize.height * CGFloat(scale - 1)) / 2)
        return (
            min(max(x, -maxX), maxX),
            min(max(y, -maxY), maxY)
        )
    }

    private func clampCoreState() {
        month = min(max(month, 1), 12)
        weekIndex = min(max(weekIndex, 0), max(0, generateCalendar(year: year, month: month).weeks.count - 1))
        strokeSize = clampStroke(strokeSize)
        activeColorHex = normalizedColorHex(activeColorHex)
        zoomScale = clampZoomScale(zoomScale)
        quickSlots = normalizedQuickSlots(quickSlots)
        favoriteColors = favoriteColors.filter(isValidHexColor).prefix(PlannerDefaults.favoriteColorLimit).map { $0 }
        favoriteStyles = Array(favoriteStyles.prefix(PlannerDefaults.favoriteStyleLimit))
    }

    private func normalizedColorHex(_ value: String) -> String {
        let normalized = value.lowercased()
        return isValidHexColor(normalized) ? normalized : PlannerDefaults.defaultColor
    }

    private func clampStroke(_ value: Double) -> Double {
        min(max(value, PlannerDefaults.minStroke), PlannerDefaults.maxStroke)
    }

    private func clampZoomScale(_ value: Double) -> Double {
        min(max(value, PlannerDefaults.minZoom), PlannerDefaults.maxZoom)
    }

    private func normalizedQuickSlots(_ slots: [PlannerTool]) -> [PlannerTool] {
        var normalized = Array(slots.prefix(PlannerDefaults.quickSlots.count))
        if normalized.count < PlannerDefaults.quickSlots.count {
            normalized.append(contentsOf: PlannerDefaults.quickSlots.dropFirst(normalized.count))
        }
        return normalized
    }

    private func makeID() -> String {
        "\(Date().timeIntervalSince1970)-\(UUID().uuidString.prefix(6))"
    }

    private func snapshot() -> PlannerSnapshot {
        PlannerSnapshot(
            year: year,
            month: month,
            weekIndex: weekIndex,
            activeSpread: activeSpread,
            activeTool: activeTool,
            activeColorHex: activeColorHex,
            strokeSize: strokeSize,
            activeTip: activeTip,
            shapeKind: shapeKind,
            activeSymbol: activeSymbol,
            textStamp: textStamp,
            imageStampData: imageStampData,
            allowFingerDrawing: allowFingerDrawing,
            zoomScale: zoomScale,
            zoomOffsetX: zoomOffsetX,
            zoomOffsetY: zoomOffsetY,
            toolbarPosition: toolbarPosition,
            toolbarCollapsed: toolbarCollapsed,
            quickSlots: quickSlots,
            favoriteColors: favoriteColors,
            favoriteStyles: favoriteStyles,
            pages: pages,
            activePageID: activePageID
        )
    }

    private func applySnapshot(_ snapshot: PlannerSnapshot) {
        year = snapshot.year
        month = snapshot.month
        weekIndex = snapshot.weekIndex
        activeSpread = snapshot.activeSpread
        activeTool = snapshot.activeTool
        activeColorHex = snapshot.activeColorHex
        strokeSize = snapshot.strokeSize
        activeTip = snapshot.activeTip
        shapeKind = snapshot.shapeKind
        activeSymbol = snapshot.activeSymbol
        textStamp = snapshot.textStamp
        imageStampData = snapshot.imageStampData
        allowFingerDrawing = snapshot.allowFingerDrawing
        zoomScale = snapshot.zoomScale
        zoomOffsetX = snapshot.zoomOffsetX
        zoomOffsetY = snapshot.zoomOffsetY
        toolbarPosition = snapshot.toolbarPosition
        toolbarCollapsed = snapshot.toolbarCollapsed
        quickSlots = snapshot.quickSlots
        favoriteColors = snapshot.favoriteColors
        favoriteStyles = snapshot.favoriteStyles
        pages = snapshot.pages
        activePageID = snapshot.activePageID
    }

    private func restoreSnapshotIfAvailable() {
        let url = Self.snapshotURL
        guard let data = try? Data(contentsOf: url) else { return }
        guard let decoded = try? JSONDecoder().decode(PlannerSnapshot.self, from: data) else { return }
        applySnapshot(decoded)
    }

    private func scheduleSave() {
        guard !isHydrating else { return }
        let snapshot = snapshot()
        saveTask?.cancel()
        saveTask = Task.detached(priority: .utility) {
            try? await Task.sleep(nanoseconds: 220_000_000)
            do {
                let data = try JSONEncoder().encode(snapshot)
                let url = Self.snapshotURL
                let dir = url.deletingLastPathComponent()
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                try data.write(to: url, options: .atomic)
            } catch {
                // Ignore transient write failures.
            }
        }
    }
}
