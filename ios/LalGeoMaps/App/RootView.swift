import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        Group {
            switch store.sessionState {
            case .restoring:
                VStack(spacing: 14) {
                    ProgressView()
                    Text("Opening LalGeo Maps…")
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("restoringSession")
            case .signedOut:
                ConnectView()
            case .signedIn:
                MapLibraryView()
            }
        }
        .task { await store.start() }
        .alert(item: $store.notice) { notice in
            Alert(
                title: Text(notice.title),
                message: Text(notice.message),
                dismissButton: .default(Text("OK"))
            )
        }
    }
}

