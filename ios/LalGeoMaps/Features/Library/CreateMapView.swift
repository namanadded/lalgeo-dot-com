import SwiftUI

struct CreateMapView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var isCreating = false
    @FocusState private var focusedField: Field?

    let onCreated: (LalGeoMap) -> Void

    private enum Field { case name, description }

    var body: some View {
        NavigationStack {
            Form {
                Section("Map details") {
                    TextField("Name", text: $name)
                        .focused($focusedField, equals: .name)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .description }
                        .accessibilityIdentifier("mapNameField")

                    TextField("Description (optional)", text: $description, axis: .vertical)
                        .lineLimit(2 ... 5)
                        .focused($focusedField, equals: .description)
                        .accessibilityIdentifier("mapDescriptionField")

                    HStack {
                        Spacer()
                        Text("\(name.utf16.count) / 200")
                            .font(.caption)
                            .foregroundStyle(name.utf16.count > 200 ? .red : .secondary)
                    }
                    .accessibilityLabel("\(name.utf16.count) of 200 characters")
                }

                Section {
                    Label("The API creates an empty map. Its portable copy opens with an editable Points layer.", systemImage: "info.circle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New API Map")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isCreating)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isCreating ? "Creating…" : "Create") {
                        Task { await create() }
                    }
                    .disabled(
                        isCreating ||
                        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        name.utf16.count > 200
                    )
                    .accessibilityIdentifier("confirmCreateMapButton")
                }
            }
            .interactiveDismissDisabled(isCreating)
            .onAppear { focusedField = .name }
        }
    }

    private func create() async {
        guard !isCreating else { return }
        isCreating = true
        defer { isCreating = false }
        guard let map = await store.createMap(name: name, description: description) else { return }
        dismiss()
        onCreated(map)
    }
}
