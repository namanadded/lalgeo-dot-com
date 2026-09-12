import SwiftUI

@main
struct LalGeoMapsApp: App {
    @StateObject private var store: AppStore

    init() {
        let environment = AppEnvironment.current()
        _store = StateObject(
            wrappedValue: AppStore(
                api: environment.api,
                credentials: environment.credentials,
                cache: environment.cache
            )
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
        }
    }
}

