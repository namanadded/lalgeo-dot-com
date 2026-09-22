import SwiftUI

struct MapDetailView: View {
    @EnvironmentObject private var store: AppStore
    @State private var contents: [LayerFeatures] = []
    @State private var isLoading = true
    @State private var loadError: Error?
    @State private var isExporting = false
    @State private var shareItem: ShareItem?
    @State private var exportErrorMessage: String?
    @State private var isAddingPoint = false

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
        .sheet(isPresented: $isAddingPoint) {
            AddPointView(map: map, pointLayers: contents.map(\.layer).filter { $0.geometryType == .point }) {
                Task { await load() }
            }
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
                    Text("Add a point to create a Point layer, or export an empty portable copy.")
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

            if !isLoading && loadError == nil {
                Button {
                    isAddingPoint = true
                } label: {
                    Label("Add point", systemImage: "mappin.and.ellipse")
                }
                .accessibilityHint("Enter a point name and WGS84 coordinates")
                .accessibilityIdentifier("addPointButton")
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

private struct AddPointView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var latitude = ""
    @State private var longitude = ""
    @State private var selectedLayerID = ""
    @State private var newLayerName = "Points"
    @State private var featureID = "feature_ios_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
    @State private var layerID = "layer_ios_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var hasUnconfirmedSave = false
    @State private var showsDiscardConfirmation = false

    let map: LalGeoMap
    let pointLayers: [MapLayer]
    let onSaved: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                        .textInputAutocapitalization(.words)
                        .disabled(hasUnconfirmedSave)
                        .accessibilityIdentifier("pointNameField")
                    TextField("Latitude", text: $latitude)
                        .keyboardType(.numbersAndPunctuation)
                        .disabled(hasUnconfirmedSave)
                        .accessibilityIdentifier("pointLatitudeField")
                    TextField("Longitude", text: $longitude)
                        .keyboardType(.numbersAndPunctuation)
                        .disabled(hasUnconfirmedSave)
                        .accessibilityIdentifier("pointLongitudeField")
                    if let validationMessage,
                       !name.isEmpty || !latitude.isEmpty || !longitude.isEmpty {
                        Text(validationMessage)
                            .font(.footnote)
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("pointValidationMessage")
                    }
                } header: {
                    Text("Point")
                } footer: {
                    Text("Use WGS84 decimal degrees, with a period for decimals. Latitude −90 to 90; longitude −180 to 180. No location permission is needed.")
                }

                Section("Point layer") {
                    if !pointLayers.isEmpty {
                        Picker("Save in", selection: $selectedLayerID) {
                            ForEach(pointLayers) { layer in
                                Text(layer.name).tag(layer.id)
                            }
                            Text("New Point layer").tag("")
                        }
                        .disabled(hasUnconfirmedSave)
                        .accessibilityIdentifier("pointLayerPicker")
                    }
                    if selectedLayerID.isEmpty {
                        TextField("Layer name", text: $newLayerName)
                            .disabled(hasUnconfirmedSave)
                            .accessibilityIdentifier("pointLayerNameField")
                    }
                }

                if let saveError {
                    Section {
                        Label(saveError, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .accessibilityIdentifier("pointSaveError")
                        if hasUnconfirmedSave {
                            Text("The upload may have succeeded. Keep this form open and retry when connected; this entry reuses the same IDs so LalGeo can check before another write. Point drafts are not stored offline.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Add point")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if hasUnconfirmedSave { showsDiscardConfirmation = true }
                        else { dismiss() }
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save") {
                        Task { await save() }
                    }
                    .disabled(isSaving || validationMessage != nil)
                    .accessibilityIdentifier("savePointButton")
                }
            }
            .interactiveDismissDisabled(isSaving || hasUnconfirmedSave)
            .confirmationDialog("Discard this point entry?", isPresented: $showsDiscardConfirmation) {
                Button("Discard entry", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) { }
            } message: {
                Text("LalGeo could not confirm the last upload. Discarding loses the IDs used to check whether it succeeded.")
            }
            .onAppear {
                if selectedLayerID.isEmpty, let first = pointLayers.first {
                    selectedLayerID = first.id
                }
            }
        }
    }

    private var validationMessage: String? {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedName.isEmpty || trimmedName.utf16.count > 200 { return "Enter a point name of 200 characters or fewer." }
        guard let latitudeValue = Double(latitude.trimmingCharacters(in: .whitespacesAndNewlines)),
              latitudeValue.isFinite, (-90 ... 90).contains(latitudeValue),
              let longitudeValue = Double(longitude.trimmingCharacters(in: .whitespacesAndNewlines)),
              longitudeValue.isFinite, (-180 ... 180).contains(longitudeValue) else {
            return "Enter valid latitude and longitude in decimal degrees."
        }
        if selectedLayerID.isEmpty {
            let trimmedLayer = newLayerName.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmedLayer.isEmpty || trimmedLayer.utf16.count > 200 { return "Enter a Point layer name of 200 characters or fewer." }
        }
        return nil
    }

    private func save() async {
        guard !isSaving, validationMessage == nil,
              let lat = Double(latitude.trimmingCharacters(in: .whitespacesAndNewlines)),
              let lon = Double(longitude.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let layerChoice: PointLayerChoice
        if let selected = pointLayers.first(where: { $0.id == selectedLayerID }) {
            layerChoice = .existing(selected)
        } else {
            layerChoice = .new(LayerDraft(
                id: layerID,
                name: newLayerName.trimmingCharacters(in: .whitespacesAndNewlines),
                geometryType: .point
            ))
        }
        let draft = PointFeatureDraft(id: featureID, name: trimmedName, latitude: lat, longitude: lon)
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            _ = try await store.addPoint(to: map, layer: layerChoice, draft: draft)
            hasUnconfirmedSave = false
            onSaved()
            dismiss()
        } catch {
            let requestID = (error as? MapsAPIError)?.requestID
            saveError = error.localizedDescription + (requestID.map { " Request ID: \($0)" } ?? "")
            if let apiError = error as? MapsAPIError {
                switch apiError {
                case .offline, .transport, .invalidResponse: hasUnconfirmedSave = true
                case .unauthorized, .server: break
                }
            }
        }
    }
}
