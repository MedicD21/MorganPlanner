import SwiftUI

struct NotesSpreadView: View {
    @EnvironmentObject private var store: PlannerStore

    var body: some View {
        SpreadScaffoldView(leftRatio: 1, rightRatio: 1) {
            PlannerPageSurface(pageID: store.notesLeftPageID, pageKind: .notesLeft) {
                NotesRuledPaperBackground()
            }
        } right: {
            ZStack(alignment: .topTrailing) {
                PlannerPageSurface(pageID: store.notesRightPageID, pageKind: .notesRight) {
                    NotesDottedPaperBackground()
                }
                MonthTabsView(includeNotesTab: true)
                    .frame(width: 24)
                    .padding(.trailing, 1)
                    .padding(.vertical, 8)
            }
        }
    }
}

private struct NotesRuledPaperBackground: View {
    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let headerHeight = size.height * 0.09
            let lineHeight = max(1, (size.height - headerHeight) / 24)

            VStack(spacing: 0) {
                Text("notes")
                    .font(.system(size: 27, weight: .medium, design: .serif))
                    .italic()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(PlannerTheme.line).frame(height: 1)
                    }

                ForEach(0..<24, id: \.self) { _ in
                    Rectangle()
                        .fill(Color.clear)
                        .frame(height: lineHeight)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(PlannerTheme.line).frame(height: 1)
                        }
                }
            }
        }
    }
}

private struct NotesDottedPaperBackground: View {
    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let headerHeight = size.height * 0.09
            VStack(spacing: 0) {
                Text("ideas")
                    .font(.system(size: 27, weight: .medium, design: .serif))
                    .italic()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(PlannerTheme.line).frame(height: 1)
                    }

                DotGridBackground()
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(PlannerTheme.hairline).frame(height: 1)
                    }
            }
            .frame(width: size.width, height: size.height)
            .padding(.top, 0)
            .overlay(
                Rectangle()
                    .fill(Color.clear)
                    .frame(height: headerHeight),
                alignment: .top
            )
        }
    }
}
