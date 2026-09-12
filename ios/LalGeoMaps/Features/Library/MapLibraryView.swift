import SwiftUI

struct MapLibraryView: View {
    @EnvironmentObject private var store: AppStore
    @State private var path: [LalGeoMap] = []
    @State private var isPresentingCreateMap = false

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if store.maps.isEmpty && store.isRefreshing {
                    ProgressView("Loading API Maps…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityIdentifier("loadingMaps")
                } else if store.maps.isEmpty {
                    ContentUnavailableView {
                        Label("No API Maps yet", systemImage: "map")
                    } description: {
                        Text("Create a map here, then add layers and features through LalGeo’s API or web workspace.")
                    } actions: {
                        Button("Create Map") { isPresentingCreateMap = true }
                            .buttonStyle(.borderedProminent)
                            .accessibilityIdentifier("emptyCreateMapButton")
                    }
                    .accessibilityIdentifier("emptyMapLibrary")
                } else {
                    mapList
                }
            }
            .navigationTitle("API Maps")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { accountMenu }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        isPresentingCreateMap = true
                    } label: {
                        Label("Create Map", systemImage: "plus")
                    }
                    .accessibilityIdentifier("createMapButton")
                }
            }
            .navigationDestination(for: LalGeoMap.self) { map in
                MapDetailView(map: map)
            }
            .sheet(isPresented: $isPresentingCreateMap) {
                CreateMapView { map in
                    path.append(map)
                }
            }
        }
    }

    private var mapList: some View {
        List {
            if store.isUsingOfflineSnapshot {
                Section {
                    Label {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Saved catalog")
                                .font(.headline)
                            Text("Read-only until LalGeo reconnects")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "wifi.slash")
                            .foregroundStyle(.orange)
                    }
                }
                .accessibilityIdentifier("offlineSnapshotBanner")
            }

            Section {
                ForEach(store.maps) { map in
                    NavigationLink(value: map) {
                        MapRow(map: map)
                    }
                    .accessibilityIdentifier("mapRow_\(map.id)")
                }
            } footer: {
                Text("API Maps are owner-scoped server maps. Portable copies open separately in LalGeo Maps on the web.")
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await store.refresh() }
        .accessibilityIdentifier("mapLibrary")
    }

    private var accountMenu: some View {
        Menu {
            Link(destination: URL(string: "https://maps.lalgeo.com/maps")!) {
                Label("Open LalGeo Maps on the web", systemImage: "safari")
            }

            Button(role: .destructive) {
                Task { await store.disconnect() }
            } label: {
                Label("Disconnect API Key", systemImage: "rectangle.portrait.and.arrow.right")
            }
        } label: {
            Label("Account", systemImage: "person.crop.circle")
        }
        .accessibilityIdentifier("accountMenu")
    }
}

private struct MapRow: View {
    let map: LalGeoMap

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "map.fill")
                .font(.title2)
                .foregroundStyle(.tint)
                .frame(width: 32, height: 32)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(map.name)
                    .font(.headline)
                    .lineLimit(2)
                if !map.description.isEmpty {
                    Text(map.description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                if let date = map.updatedDate {
                    Text("Updated \(date.formatted(.relative(presentation: .named)))")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(.vertical, 4)
        }
    }
}

