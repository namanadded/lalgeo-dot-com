import SwiftUI

struct MapDetailView: View {
    @EnvironmentObject private var store: AppStore
    @State private var contents: [LayerFeatures] = []
    @State private var isLoading = true
    @State private var loadError: Error?
    @State private var isExporting = false
    @State private var shareItem: ShareItem?
    @State private var exportErrorMessage: String?

    let map: LalGeoMap

    var body: some View {
        List {
            Section {
                MapCanvas(map: map, contents: contents)
                    .frame(minHeight: 320)
                    .listRowInsets(EdgeInsets())
                    .accessibilityIdentifier("nativeMapPreview")
            }

            Section("Map details") {
                LabeledContent("Name", value: map.name)
                if !map.description.isEmpty {
                    LabeledContent("Description", value: map.description)
                }
                LabeledContent("Basemap", value: map.mapType.rawValue.capitalized)
                LabeledContent("Points of interest", value: map.showBasemapPOIs ? "Shown" : "Hidden")
            }

            contentSection

            Section {
                Button {
                    Task { await export() }
                } label: {
                    HStack {
                        Label("Share portable copy", systemImage: "square.and.arrow.up")
                        Spacer()
                        if isExporting { ProgressView() }
                    }
                }
                .disabled(isExporting)
                .accessibilityHint("Exports the server’s canonical LalGeo project as a dot lal file")
                .accessibilityIdentifier("sharePortableCopyButton")

                Link(destination: URL(string: "https://maps.lalgeo.com/maps")!) {
                    Label("Open LalGeo Maps on the web", systemImage: "safari")
                }
            } footer: {
                Text("The shared .lal file opens as an editable local copy. Changes to that copy do not sync back to this API Map.")
            }
        }
        .navigationTitle(map.name)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: map.id) { await load() }
        .refreshable { await load() }
        .sheet(item: $shareItem) { item in
            ActivityView(activityItems: [item.url])
                .ignoresSafeArea()
        }
        .alert("Couldn’t share portable copy", isPresented: exportErrorBinding) {
            Button("OK", role: .cancel) { exportErrorMessage = nil }
        } message: {
            Text(exportErrorMessage ?? "Please try again.")
        }
    }

    @ViewBuilder
    private var contentSection: some View {
        Section("Layers") {
            if isLoading {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Loading layers and features…")
                        .foregroundStyle(.secondary)
                }
                .accessibilityIdentifier("loadingMapContents")
            } else if let loadError {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Preview unavailable", systemImage: "exclamationmark.triangle")
                        .font(.headline)
                    Text(loadError.localizedDescription)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button("Try Again") { Task { await load() } }
                }
                .padding(.vertical, 6)
                .accessibilityIdentifier("mapContentsError")
            } else if contents.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("No API layers yet")
                        .font(.headline)
                    Text("This map is ready to export. LalGeo adds an editable empty Points layer to its portable copy.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 6)
                .accessibilityIdentifier("emptyLayersState")
            } else {
                ForEach(contents) { content in
                    HStack(spacing: 12) {
                        Image(systemName: content.layer.geometryType.symbolName)
                            .foregroundStyle(.tint)
                            .frame(width: 24)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(content.layer.name)
                                .font(.headline)
                            Text("\(content.features.count) \(content.features.count == 1 ? "feature" : "features") · \(content.layer.geometryType.rawValue)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private var exportErrorBinding: Binding<Bool> {
        Binding(
            get: { exportErrorMessage != nil },
            set: { if !$0 { exportErrorMessage = nil } }
        )
    }

    private func load() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            contents = try await store.loadContents(for: map)
        } catch {
            loadError = error
        }
    }

    private func export() async {
        guard !isExporting else { return }
        isExporting = true
        defer { isExporting = false }
        do {
            let url = try await store.exportPortableCopy(of: map)
            shareItem = ShareItem(url: url)
        } catch {
            let requestID = (error as? MapsAPIError)?.requestID
            exportErrorMessage = error.localizedDescription + (requestID.map { "\n\nRequest ID: \($0)" } ?? "")
        }
    }
}

